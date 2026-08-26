# Digest: Machine geometry & physical specs (round 1)

Scope note on evidence quality: pinball's physical spec base is **unevenly documented**. Ball diameter, pitch, cabinet/game dimensions, and coil part specs are well sourced (manufacturer manuals, parts catalogs, dedicated reference charts). Flipper arc angle, flipper gap, rubber durometer, restitution/friction coefficients, and measured ball speeds are **thin to absent in primary literature** — what exists is hobbyist measurement or simulator tuning values. Every finding below is labeled accordingly. Where I could only reach a claim through an aggregator (Perplexity) without retrieving the underlying page this run, I mark it `confidence: low` and say so.

---

## 1. Playfield, cabinet, and machine dimensions

**The standard-body pinball playfield across Bally, Gottlieb, Williams and Stern Electronics (EM and solid-state eras) is 20.25 in × 42.00 in (514.35 mm × 1066.80 mm).** This is the single most-repeated figure in the hobby and the Pinball Makers wiki tabulates it as the common value across all four manufacturers.
- source: https://pinballmakers.com/wiki/index.php?title=Playfield_Sizes | publisher: Pinball Makers wiki | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**Widebody playfields deviate substantially and are not one size:** Williams System 1–11 widebody 27.00 in × 42.00 in; Atari widebody 27.00 in × 45.00 in; Bally widebody 26.75 in × 40.50 in; Data East widebody 25.00 in × 51.75 in; Gottlieb System 80 "Circus" extra-wide 26.75 in × 46.50 in. Outliers exist even inside a family (WMS WPC *Safecracker* is 16.50 in × 41.50 in; Alvin G *Mystery Castle* 20.25 in × 46.00 in).
- source: https://pinballmakers.com/wiki/index.php?title=Playfield_Sizes | publisher: Pinball Makers wiki | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**Standard-body playfield glass measures 109.3 cm × 53.3 cm (1093 mm × 533 mm ≈ 43.03 in × 20.98 in), 3/16 in thick; WPC "Superbody" glass is 60.3 cm (603 mm ≈ 23.74 in) wide.** Glass is slightly larger than the playfield since it spans the side rails, so this is a useful upper bound on the playable cavity, not the playfield surface itself.
- source: https://www.flippers.be/basics/101_pinball_dimensions.html | publisher: Flippers.be (John Robertson / Belgian pinball reference site) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**Bally/Williams WPC cabinet (1990–1998): standard width 56 cm (560 mm / 22.05 in), widebody width 63 cm (630 mm / 24.80 in), depth 140 cm (1400 mm / 55.12 in), front height 40 cm (400 mm / 15.75 in), back height 60.5 cm (605 mm / 23.82 in).** The cabinet's own front/back heights encode the built-in cabinet rake before leg levelers are considered.
- source: https://www.flippers.be/basics/101_pinball_dimensions.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**WPC backbox: 73 cm wide (730 mm / 28.74 in; 74 cm / 29.13 in including bolts) × 73 cm high (730 mm / 28.74 in). Total assembled machine height ≈ 193 cm (1930 mm / 75.98 in), ±1–2 cm. Folded for transport (head down, legs off): 75 cm (750 mm / 29.53 in) high. System 11 backboxes are ~1 cm wider than WPC.**
- source: https://www.flippers.be/basics/101_pinball_dimensions.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**Player-interface heights on a WPC cabinet: lockdown bar at 90–92 cm (900–920 mm / 35.4–36.2 in) from floor; flipper buttons at 85–87 cm (850–870 mm / 33.5–34.3 in).** Relevant if the sim models a physical cabinet or VR playfield height.
- source: https://www.flippers.be/basics/101_pinball_dimensions.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**Modern Stern standard-body games are specified in Stern's own service manuals as: weight 210 lb (95.3 kg); maximum game dimensions with leg levelers extended 78 in H × 27.75 in W × 57 in D (1981 × 705 × 1448 mm); minimum game dimensions 76 in × 27.75 in × 57 in (1930 × 705 × 1448 mm); minimum room dimensions per game 80 in × 36 in × 84 in (2032 × 914 × 2134 mm).** These same numbers recur across Stern manuals for Guardians of the Galaxy (500-55L5-01), Jurassic Park Pro, Godzilla Pro, Teenage Mutant Ninja Turtles, and Avengers Infinity Quest — i.e. Stern's standard body is dimensionally uniform across the Spike 2 line.
- source: https://www.manualslib.com/manual/2059636/Stern-Pinball-500-55l5-01.html?page=52 | publisher: Stern Pinball (service & operation manual, indexed via ManualsLib) | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: dimension-spec
- note: retrieved via search-result extraction; direct fetch of ManualsLib and of sternpinball.com PDFs returned 403 / unextractable binary this run. Corroborated by identical spec blocks listed for four other Stern titles in the same index.

**WPC-era standard-body machine weight is commonly given as ~250–280 lb (113–127 kg), typically quoted around 260 lb (118 kg) — notably heavier than a modern Stern at 210 lb.** This figure did not resolve to a retrieved primary page this run.
- source: https://pinwiki.com/wiki/index.php?title=Vehicles_for_Moving_Pinball_Machines | publisher: PinWiki (via aggregator summary) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief.** Aggregator-reported; I did not retrieve the PinWiki page. IPDB per-title pages do carry weights but I did not open one this run. Treat as a range to confirm.

---

## 2. Playfield pitch / slope

**The manufacturer-stated ideal playfield pitch for modern games is 6.5°.** Spooky Pinball's *Rick and Morty* and *Alice Cooper's Nightmare Castle* manuals both state "Ideal playfield pitch is 6.5°" and explain that raising the rear increases pitch and game speed. Stern's factory recommendation is likewise cited as 6.5° by operators.
- source: https://www.spookypinball.com/wp-content/uploads/2024/08/Rick-and-Morty-Manual.pdf | publisher: Spooky Pinball LLC | pub_date: 2024-08 | accessed: 2026-08-26 | confidence: medium | class: dimension-spec
- source: https://www.spookypinball.com/wp-content/uploads/2024/09/ACNC-Manual.pdf | publisher: Spooky Pinball LLC | pub_date: 2024-09 | accessed: 2026-08-26 | confidence: medium | class: dimension-spec
- note: cited via aggregator; PDFs not directly opened this run.

**Electromechanical-era machines were designed for a shallower pitch, around 5°.**
- source: https://www.flippers.be/basics/101_level_pinball_machine.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: dimension-spec

**There is no single mandated IFPA tournament pitch. The competitive working range is 6.5°–8.5°.** On the main competitive-pinball forum thread on the subject, Cayle George recommends "between 6.5 and 8.5 degrees," adding that "once you start pressing 9 deg things start feeling a bit weird" and "less than 6.5 feels very floaty"; Josh Sharpe-era tournament operator "Pinwizj" reports running his games at **7.5–8°**; another poster keeps "Stern games at factory recommendations (6.5 degrees)." PAPA's representative (PAPA_Doug) explicitly states PAPA uses **various angles per game** rather than one standard, noting steeper pitch makes games faster but more controllable and shallower pitch makes them slower but harder to control laterally.
- source: https://tiltforums.com/t/what-playfield-angle-for-competition-play/688 | publisher: Tilt Forums (competitive pinball community) | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: estimate
- note: this is the strongest evidence retrieved. **Absence of evidence is a finding: no IFPA rulebook clause specifying a pitch was located.** PAPA_Doug's statement is direct evidence that a major tournament org deliberately does *not* standardize pitch.

**Directional gameplay effect of pitch (qualitative, from setup guides): below ~6° play is slow and "floaty," balls can stall on ramps and hang in saucers not designed for a shallow angle; at 6.5° shot geometry, switch timing and orbit returns behave as designed; at 7–8°+ ball times shorten, misses are punished harder, and ramps/orbits can reject more and airball.**
- source: https://www.flippers.be/basics/101_level_pinball_machine.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: estimate

**Bally/Williams cabinets carry a built-in bubble level calibrated for pitch: the bottom line ≈ 6°, each line above adds 0.5°, so the bubble at the second line ≈ 6.5°.** Useful if the sim models an in-cabinet level indicator.
- source: https://www.flippers.be/basics/101_level_pinball_machine.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec

---

## 3. The ball

**Standard pinball diameter is 1-1/16 in = 1.0625 in = 26.99 mm (commonly rounded to 27 mm / 2.7 cm), and has been consistent for decades.** VPX's own unit system is anchored to it: "50 VP units = 1.0625"" and "In VPX, 50 units correspond to the ball diameter."
- source: https://docs.visualpinball.org/creators-guide/editor/units-3d-space.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec
- source: https://www.flippers.be/basics/101_pinballs.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: dimension-spec

**Standard ball mass is ~80 g. VPX treats 80 g as the reference: its flipper/ball mass parameter of "1 corresponds to standard ball mass, 80g".** Supplier listings cluster slightly above: Pinball Life lists its standard 1-1/16 in pinball at **2-7/8 oz (≈81.5 g)**; Arcade Parts & Repair lists a 1-1/16 in carbon steel ball at **80.3 g**; one chrome-ball vendor lists 3 oz (≈85 g). **Use 80 g as the sim constant; 80–82 g is the realistic spread, with chrome/specialty balls up to ~85 g.**
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: physics-constant
- source: https://www.pinballlife.com/1-116-pinball-standard-size.html | publisher: Pinball Life | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.arcadepartsandrepair.com/store/pinball-kits-parts/pinball-balls-hardware-fasteners/pinball-1-1-16-standard-size-steel-ball-ph1000/ | publisher: Arcade Parts & Repair | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- note: both vendor pages returned HTTP 403 to direct fetch this run; figures come from aggregator extraction of those listings.

**Material is steel — commonly carbon steel, with chrome-plated and magnet-friendly "Polaris" carbon steel variants sold for games with magnets.** A buying guide cites an official tolerance of **1.0625 in ± 0.0005 in (26.99 mm ± 0.013 mm)**.
- source: https://www.flippers.be/basics/101_pinballs.html | publisher: Flippers.be | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.alibaba.com/product-insights/how-to-choose-the-best-pinball-balls-a-complete-buying-guide.html | publisher: Alibaba product-insights guide | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: the ±0.0005 in tolerance traces to a commerce content page, not a manufacturer drawing. Treat as unverified.

**Mini/upper-playfield balls exist as a distinct class (e.g. Simpsons Pinball Party and World Poker Tour upper-playfield mini flippers imply matched smaller balls), but I did not retrieve a spec sheet giving mini-ball diameter or mass.** See "could not find."

---

## 4. Flippers

**Standard full-size flipper bat length is 3.0 in (76.2 mm); with the flipper rubber fitted the effective length is ~3.125 in (79.4 mm), which VPE encodes as ~147 VP units (start radius + length + end radius).** VPE's stated conversion is 1 VP unit = 0.02125 in = 0.53975 mm.
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec
- source: https://docs.visualpinball.org/creators-guide/editor/units-3d-space.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: dimension-spec

**Stern / Data East / Sega-style flipper bat-and-shaft assemblies pair the 3 in bat with a 2-3/16 in (55.6 mm) shaft; mini/upper-playfield bats are ~2-3/16 in long.**
- source: https://www.marcospecialties.com/pinball-parts/PLFD-FLIP-BAT | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- source: https://www.pinballlife.com/flipper-bat-and-shaft-assemblies-no-logo.html | publisher: Pinball Life | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- note: aggregator-reported; Marco and Pinball Life both 403 direct fetch.

**Flipper pivot spacing on a standard playfield is ~7.0 in (177.8 mm) center-to-center between the flipper pivot holes, with some games widening it by about 1/8 in. That yields a tip-to-tip gap at rest of roughly 3/8–1/2 in (9.5–12.7 mm).** This is the weakest-sourced core geometry number in the whole dimension.
- source: https://pinside.com/pinball/forum/topic/what-is-the-regular-distance-between-flippers | publisher: Pinside (hobbyist forum) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief.** Direct fetch returned 403; figure reached only via aggregator summary of that thread. The 3/8–1/2 in tip gap is a derivation, not a measurement. Needs independent confirmation before it becomes a sim constant — see leads.

**Flipper total rotation is commonly stated as ~50–52° of arc, varying by system and setup.** No parts-catalog or manual spec sheet giving an exact arc was located.
- source: https://pinside.com/pinball/forum/topic/what-is-the-regular-distance-between-flippers | publisher: Pinside (hobbyist forum, via aggregator) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief.** Report as hobbyist convention, not spec.

**Williams/Bally WPC flipper coils are dual-wound (separate power and hold windings) running on the 50 V flipper supply. Approximate resistances and windings: FL-11629 (blue) — power ~4.0 Ω, 23 AWG, ~800 turns; hold ~132 Ω, 32 AWG, ~3000 turns; the strongest common WPC flipper coil, used for long shots and high ramps. FL-15411 (orange) — power ~4.2 Ω, hold ~145 Ω; "medium-strong," for long playfield shots.**
- source: https://www.marcospecialties.com/pinball-parts/FL-11629 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.marcospecialties.com/pinball-parts/FL-15411 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.flippers.com/coil-resistance.html | publisher: Flippers.com coil resistance chart | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- note: all three pages returned HTTP 403 to direct fetch this run; values come from aggregator extraction of those listings, which agreed with each other. The winding/turns detail (23 AWG/800, 32 AWG/3000) traces specifically to the flippers.com chart.

**WPC flipper coil strength ordering, weakest to strongest: FL-11753 (yellow, short flippers/close shots) < FL-11722 (green, close shots near drops) < FL-11630 (red, standard and most common) < FL-15411 (orange, long shots) < FL-11629 (blue, long shots and high ramps).** Directly useful as a sim "flipper strength tier" parameter.
- source: https://www.marcospecialties.com/pinball-parts/FL-15411 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://homepinballrepair.com/pinball-flipper-coils/ | publisher: Home Pinball Repair | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec

**EOS behavior: at the start of the flip the EOS switch is closed and the high-power winding carries maximum current for the snap; as the bat nears top of travel the EOS opens, cutting/reducing the power winding, and the high-resistance hold winding (132–145 Ω) alone holds the bat up at low current, preventing coil burn-out. A failed-closed EOS leaves the power winding energized and overheats the coil.**
- source: https://www.flippers.com/coil-resistance.html | publisher: Flippers.com | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.marcospecialties.com/pinball-parts/FL-11629 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec

**Modern PWM flipper control (WPC-95 onward, and Stern SPIKE with electronic EOS sensing) applies a near-100% duty short pulse to fire and then drops to a low duty cycle to hold — functionally mimicking what the hold winding plus mechanical EOS did.** Reported hold duty on the order of 10–30% of full power.
- source: https://www.pinballrebel.com/pinball/cards/Tech_Charts/Stern_Lord_of_the_Rings_Tech_Chart.pdf | publisher: PinballRebel (Stern tech chart archive) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief on the numbers.** The qualitative pulse-then-hold architecture is well attested; the 10–30% duty figure and any activation-time-in-milliseconds are **not** documented in the sources reached. Flipper firing pulse duration in ms was not found in any retrieved source.

**VPX's tuned flipper physics values, era-banded — the closest thing to published measured behavior for a simulation.** Solenoid Strength: EM 500–1000 (750 typical); late 70s–mid 80s 1400–1600 (1500); mid 80s–early 90s 2000–2600; mid 90s and later 3200–3300 (3250). Elasticity 0.88 with falloff 0.15 across all eras. Friction 0.8–0.9 (varies by era). Return Strength ratio: EM 0.11; late 70s–mid 80s 0.09; mid 80s–early 90s 0.07; mid 90s+ 0.055. Coil Ramp Up 2.5 all eras. EOS Torque 0.275–0.3, EOS Torque Angle 4–6°. Scatter Angle 0.
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: physics-constant
- note: these are **simulator-tuned values in VPX-internal units**, not SI measurements of real hardware. They are the right starting point for a sim but must not be presented as measured physical constants. The elasticity (0.88) and friction (0.8–0.9) figures are dimensionless and directly portable; the strength numbers are not.

---

## 5. Other components

**Slingshot and pop bumper coils are the same class on most modern games: a 23 AWG / 800-turn coil, e.g. Williams AE-23-800 (≈4.2 Ω, no diode) or AE-23-800-01 (≈3.6 Ω, with diode). Spooky's coil list names "23-800" for both slingshots and pop bumpers.** On a 48 V supply this implies a peak pulse current on the order of 10–13 A. Some older Bally home models used AP-24-725 for the thumper/pop coil.
- source: https://www.marcospecialties.com/pinball-parts/AE-23-800 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.marcospecialties.com/pinball-parts/AE-23-800-01 | publisher: Marco Specialties | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec
- source: https://www.pinwiki.com/wiki/index.php/Spooky_Pinball_Repair_Guides | publisher: PinWiki | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- note: the 10–13 A peak is a V/R derivation, not a measurement. **No source gives slingshot or pop-bumper impulse in N·s or exit velocity** — see "could not find."

**Slingshot geometry is tuned by switch placement, not by a standardized dimension: the stand-up leaf switch blade should barely touch the rubber at rest so the sling fires with minimal ball movement, with a switch gap around 1/16–1/8 in (1.6–3.2 mm) on the second blade; a 1–2 in ring spans two posts with the kicker arm pivoting near mid-span and the kicker tip sitting slightly behind the rubber at rest.**
- source: https://www.pinwiki.com/wiki/index.php/General | publisher: PinWiki | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- note: aggregator-reported reading of PinWiki's repair guidance; the "1–2 in ring" and pivot-at-mid-span are inference from that text rather than a stated spec.

**Ball trough / outhole coils use a finer, higher-turn winding than slings and pops for a softer, longer pull: Spooky specifies a 26-1200 for the ball trough (vs 23-800 for slings/pops); Bally home models used AP-23-575 as the outhole kicker.**
- source: https://www.pinwiki.com/wiki/index.php/Spooky_Pinball_Repair_Guides | publisher: PinWiki | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- source: https://pinwiki.com/wiki/index.php/Bally_Home_Models | publisher: PinWiki | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec

**Standard rubber ring sizes, as stocked in a 125-piece replacement set: large rings 4 in, 3-1/2 in, 3 in, 2-1/2 in, 2 in, 1-1/2 in, 1-1/4 in, 1 in, 3/4 in; post rings 3/8 in, plus 3/16 in, 5/16 in, 7/16 in OD and 3/8 in OD bumper post rings; plus standard flipper rubbers.**
- source: https://www.pinballlife.com/125-piece-translucent-silicone-rubber-ring-set.html | publisher: Pinball Life | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: component-spec

**Rubber durometer is NOT published by the major suppliers.** The ~55 Shore A figure (natural rubber ~50–60 Shore A; silicone slightly firmer, mid-50s–60s) that circulates is a general-materials inference, not a pinball parts spec.
- source: https://www.pinballlife.com/rubber-rings-and-parts.html | publisher: Pinball Life | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief and a real gap.** No supplier listing reached this run states a Shore A value. Since black natural rubber vs. silicone vs. Perfect Play urethane materially changes bounce, a sim wanting per-material behavior has no published number to anchor to.

**Shooter/plunger barrel spring free length is 0.75 in (19.05 mm) (Pinball Life part 10-149), with a 0.814 in (20.68 mm) variant; standard / strong / weak shooter springs are sold as separate SKUs in the same length family.** No spring rate (lb/in or N/mm) is published.
- source: https://www.pinballlife.com/ball-shooter-hardware-housings-springs-sleeves-and-rubber.html | publisher: Pinball Life | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- source: https://www.pinballlife.com/springs.html | publisher: Pinball Life | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec

**Tilt bob is a plumb bob on a threaded rod hanging inside a grounded metal ring on the cabinet wall; sensitivity is set by a wing nut that raises the bob (closer to the ring = more sensitive) or lowers it (larger gap = more tolerant). Contact between bob and ring closes the tilt circuit.** Typical ring ID ~2–2.5 in and bob diameter ~1–1.25 in, with a 1–3 mm radial gap at rest.
- source: https://www.pinwiki.com/wiki/index.php/General | publisher: PinWiki | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: component-spec
- note: the mechanism description is well attested; **the ring/bob dimensions and 1–3 mm gap are explicitly inferred, not specified** — treat as estimate only.

**Outlane / drain geometry: no dimensioned specification was located.** Tournament practice of "opening outlane posts" to shorten ball times is attested in the pitch discussion but without measurements.
- source: https://tiltforums.com/t/what-playfield-angle-for-competition-play/688 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate

---

## 6. Ball speeds, ball times, restitution and friction

**No rigorous published measurement of pinball ball speed was located.** The community range, from forum discussion and one physics-blog writeup, is: slow/controlled play ~1–3 m/s; fast flipper shots and returns ~3–6 m/s; one technical writeup states a pinball "can easily travel at around 6 m/s"; above ~6–7 m/s is near the practical ceiling for a standard coil driving an 80 g ball.
- source: https://tiltforums.com/t/maximum-ball-speed/2334 | publisher: Tilt Forums | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- source: https://blog.voxagon.se/2016/02/25/pinball-physics.html | publisher: Voxagon blog (Simon Sarris / pinball physics writeup) | pub_date: 2016-02-25 | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief.** Neither page was directly retrieved this run. Report as community estimate; do not present as measured.

**No published coefficient-of-restitution measurement for a steel pinball against a clearcoated plywood + Mylar playfield, or against a pinball rubber ring, was located.** The circulating engineering approximations are: steel-on-clearcoat e ≈ 0.6 (range 0.5–0.7); steel-on-rubber-ring e ≈ 0.8 (range 0.7–0.9). These are analogies from generic material tables (steel-on-steel ≈ 0.6–0.7, rubber ≈ 0.85–0.95), reduced for mounting compliance and vibration losses.
- source: https://www.samaterials.com/content/coefficient-of-restitution.html | publisher: Stanford Advanced Materials (generic COR table) | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **This is the largest genuine gap in the dimension.** The numbers are not pinball measurements. The best *usable* substitute reached this run is VPX's tuned elasticity of **0.88 with falloff 0.15** for flipper rubber and friction **0.8–0.9** (see §4), which are at least values a working simulator ships with and validates against real-play feel.
- source: https://docs.visualpinball.org/creators-guide/manual/mechanisms/flippers.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: high | class: physics-constant

**VPE defines the physics-material parameter set a sim needs — Elasticity (bounciness on collision), Elasticity Falloff (how much less bouncy rubber gets at higher impact velocity), Friction (applied as the ball rolls along a material), and Scatter (random factor added to the collision angle) — assignable per-material or per-object.** The velocity-dependent elasticity falloff is a notable modeling detail: real pinball rubber is measurably less elastic at high impact speed.
- source: https://docs.visualpinball.org/creators-guide/editor/materials.html | publisher: Visual Pinball Engine documentation | pub_date: unknown | accessed: 2026-08-26 | confidence: medium | class: physics-constant

**No authoritative ball-time statistics were located.** Community reports: competitive players ~1.5–2 min per ball on home/league setups; a "median competitive" 3-ball game often described as 7–8 minutes (≈140–160 s/ball); tournament-tuned machines (steeper pitch, open outlanes, thin rubbers) deliberately shorter, roughly 60–120 s/ball.
- source: https://www.reddit.com/r/pinball/comments/17ct2hd/how_long_is_your_average_3_ball_game_and_how_long/ | publisher: Reddit r/pinball | pub_date: unknown | accessed: 2026-08-26 | confidence: low | class: estimate
- note: **unverified belief**, self-reported hobbyist data, not retrieved directly this run.

---

## Key numbers table

| Quantity | Value (imperial) | Value (metric) | Class | Conf. |
|---|---|---|---|---|
| Standard-body playfield | 20.25 × 42.00 in | 514.4 × 1066.8 mm | dimension-spec | high |
| Williams S1–11 widebody playfield | 27.00 × 42.00 in | 685.8 × 1066.8 mm | dimension-spec | high |
| Standard playfield glass | 20.98 × 43.03 in, 3/16 in thick | 533 × 1093 mm, 4.76 mm | dimension-spec | high |
| WPC cabinet width (std / wide) | 22.05 / 24.80 in | 560 / 630 mm | dimension-spec | high |
| WPC cabinet depth | 55.12 in | 1400 mm | dimension-spec | high |
| WPC cabinet height front / back | 15.75 / 23.82 in | 400 / 605 mm | dimension-spec | high |
| WPC backbox | 28.74 W × 28.74 H in | 730 × 730 mm | dimension-spec | high |
| WPC total assembled height | ~75.98 in | ~1930 mm | dimension-spec | high |
| Lockdown bar / flipper button height | 35.4–36.2 / 33.5–34.3 in | 900–920 / 850–870 mm | dimension-spec | high |
| Stern modern std body (levelers out) | 78 × 27.75 × 57 in (H×W×D) | 1981 × 705 × 1448 mm | dimension-spec | medium |
| Stern modern std body weight | 210 lb | 95.3 kg | dimension-spec | medium |
| WPC std body weight | ~250–280 lb (≈260 typ.) | ~113–127 kg (≈118) | estimate | low |
| Factory pitch (modern) | — | 6.5° | dimension-spec | medium |
| Pitch (EM era) | — | ~5° | dimension-spec | medium |
| Competition pitch range | — | 6.5–8.5° (7.5–8° common) | estimate | high |
| Ball diameter | 1.0625 in (±0.0005 in, low conf.) | 26.99 mm | dimension-spec | high |
| Ball mass | ~2.82–2.88 oz | 80 g (80–82 g range) | physics-constant | high |
| Flipper bat length (bare / rubbered) | 3.000 / 3.125 in | 76.2 / 79.4 mm | dimension-spec | high |
| Flipper shaft length | 2-3/16 in | 55.6 mm | component-spec | low |
| Flipper pivot spacing | ~7.0 in | ~177.8 mm | estimate | low |
| Flipper tip gap at rest | ~3/8–1/2 in | ~9.5–12.7 mm | estimate | low |
| Flipper arc | — | ~50–52° | estimate | low |
| FL-11629 (blue) power / hold | 23 AWG ~800 t / 32 AWG ~3000 t | 4.0 Ω / 132 Ω | component-spec | medium |
| FL-15411 (orange) power / hold | — | 4.2 Ω / 145 Ω | component-spec | medium |
| Flipper supply voltage (WPC) | — | 50 V | component-spec | medium |
| Sling / pop coil AE-23-800(-01) | 23 AWG, 800 turns | 4.2 Ω / 3.6 Ω w/diode | component-spec | medium |
| Trough coil (Spooky) | 26 AWG, 1200 turns | — | component-spec | low |
| Rubber ring sizes | 3/4, 1, 1-1/4, 1-1/2, 2, 2-1/2, 3, 3-1/2, 4 in | — | component-spec | medium |
| Rubber durometer | — | ~55 Shore A (inferred) | estimate | low |
| Shooter barrel spring free length | 0.75 in (0.814 in variant) | 19.05 mm (20.68 mm) | component-spec | low |
| VP unit conversion | 1 VPU = 0.02125 in; 47.0588 VPU/in | 0.53975 mm; 1.85271 VPU/mm | physics-constant | high |
| VPX flipper elasticity / falloff | — | 0.88 / 0.15 | physics-constant | high |
| VPX flipper friction | — | 0.8–0.9 | physics-constant | high |
| VPX EOS torque / angle | — | 0.275–0.3 / 4–6° | physics-constant | high |
| VPX coil strength (mid-90s+) | — | 3200–3300 (VPX units) | physics-constant | high |
| Ball speed (typical / fast) | — | 1–3 / 3–6 m/s | estimate | low |
| COR steel↔clearcoat / ↔rubber | — | ~0.6 / ~0.8 (inferred) | estimate | low |
| Ball-in-play time | — | 60–160 s | estimate | low |

---

## Leads worth chasing

1. **IPDB per-title machine pages** (e.g. https://www.ipdb.org/machine.cgi?gid=1502) carry a weight field per title — the clean way to pin down WPC standard-body weight rather than the 250–280 lb hearsay range. Not opened this run.
2. **Stern service manual PDFs on sternpinball.com.** The spec block exists (page ~52–62 of each manual) but the PDFs are image/vector-heavy and both direct WebFetch and local PDF page rendering failed (no poppler installed). Fetching a manual through a text-extraction service, or installing poppler-utils, would give a verbatim primary citation including any pitch statement, electrical spec, and the shipping vs. game weight distinction.
3. **Marco Specialties, Pinball Life, and flippers.com all return HTTP 403 to WebFetch.** These are the highest-value parts/coil primary sources in the whole dimension and everything sourced to them here is aggregator-mediated. A browser-based fetch (the chrome-devtools MCP tools are available in this environment) would convert roughly a dozen medium/low-confidence component specs to high.
4. **VPX/VPE table physics defaults page** — I retrieved the flipper mechanism page and the materials page, but not a page listing the default elasticity/friction/scatter for the *playfield surface*, rubbers, posts, metal walls, and plastics. That table is exactly what the sim needs and almost certainly exists in the VPX (not VPE) docs or in the VPX source. Also worth pulling the actual VPX source defaults from GitHub.
5. **Williams WPC service manuals** (e.g. Addams Family, Twilight Zone) contain flipper coil pulse-time and hold parameters in the operator adjustment menus and a mechanical drawing section — the likely home of the missing flipper firing-duration-in-ms and PWM duty numbers.
6. **Pinscape build guide (mjrnet.org)** has detailed dimensioned cabinet drawings for virtual-cabinet builders — the best free source of exact cabinet body geometry including the playfield opening. TLS handshake failed on direct fetch this run; retry over a different client.
7. **Playfield CAD / whitewood templates** from pinballmakers.com and open-source projects (e.g. Multimorphic P3, FAST Pinball docs) would give real post/insert/outlane placement geometry, which no source here provided.
8. **The 7 in flipper pivot spacing is the single number most worth independently confirming** — measure it off a published playfield CAD or a Williams drawing rather than a forum thread. It sets the drain geometry the whole sim is balanced around.

## Looked for but could not find

- **Any IFPA rulebook clause specifying a tournament playfield pitch.** PAPA's own representative states they vary angle per game. The absence appears to be real, not a search failure: competitive pinball standardizes *consistency across the bank*, not a degree number.
- **Flipper activation/firing pulse duration in milliseconds** for any Williams or Stern system. Nothing retrieved gives it. The "10–30% hold duty cycle" figure is aggregator inference, not documented.
- **Any measured coefficient of restitution or friction for a steel pinball against a real playfield surface (wood + Mylar + clearcoat) or against a pinball rubber ring.** Nothing pinball-specific exists in what was reachable; all circulating values are analogies from generic material tables. VPX's tuned constants are the only defensible substitute.
- **Slingshot or pop-bumper impulse, exit velocity, or force in physical units.** Sources give coil resistance and turns only; the mechanical output is nowhere quantified.
- **Shore A durometer for pinball rubber rings** — not published by Pinball Life, Marco, or Titan/Perfect Play listings reached this run.
- **Exact flipper rotation arc as a manufacturer spec.** Only the hobbyist ~50–52° convention.
- **Mini-ball and oversized-ball diameter/mass specs.** Mini flipper bats are catalogued, but no matching ball spec sheet was found.
- **Outlane and drain-zone dimensioned geometry** (outlane width, post positions, drain gap) — no dimensioned source located.
- **Rigorous instrumented ball-speed measurement.** Only forum estimates and one blog figure.
- **Per-title WPC weight from IPDB** — not opened; see leads.
