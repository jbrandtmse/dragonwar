# Attributions

Every third-party thing in DragonWar, and where it came from.

DragonWar is GPL-3.0 and must stay free to distribute. This file is the ledger
that keeps that true. **The entry goes in before the file does** — see the
provenance rule in `CLAUDE.md`.

If something is in the repository and not in this file, that is a bug. Fix it by
establishing the provenance or removing the file.

---

## Code

| Component | Source | Author | Licence | Verified |
|---|---|---|---|---|
| BMad Method v6.11.0 (`.claude/skills/`, `_bmad/`) | https://docs.bmad-method.org | BMad Method project | Own upstream terms; no licence file ships with the install. Tooling only — not part of the program, removable without affecting it. | 2026-08-26 |
| vpdb/vpx-js physics port (`src/sim/physics/**`) | https://github.com/vpdb/vpx-js @ commit `e8a6d6f` (tag `v1.3.4`, 2020-11-12) | freezy <freezy@vpdb.io> (Copyright (C) 2019), with contributors Jason Millard <jsm174@gmail.com> and Michael Vogt <michael@neeo.com> | **GPL-2.0-or-later**, as verified in the source file headers (e.g. `lib/physics/hit-object.ts`) — **not** from `package.json`. `package.json` at this commit declares only `"license": "GPL-2.0"`, but every header-bearing file's licence paragraph reads "either version 2 of the License, or (at your option) any later version." DragonWar exercises that or-later clause to combine this GPL-2.0-or-later code with the project's Apache-2.0 dependencies (Babylon.js) and distribute the whole under **GPL-3.0**, per `CLAUDE.md`'s provenance rule and AD-16. A small number of upstream files carried no header at all (`lib/physics/constants.ts`, `lib/physics/functions.ts`, `lib/physics/mover-object.ts`, `lib/physics/collision-type.ts`, `lib/math/frect3d.ts`); their licence was established from the repository's other header-bearing source files, per the same GPL-2.0-or-later grant — see `docs/spikes/spike-1.md` for the full deviation list. | 2026-08-27 |

*No other third-party code is compiled into DragonWar yet.*

## Assets

*None yet.* Art, audio, models, textures and fonts go here as they are added.

| Asset | Source | Author | Licence | Verified |
|---|---|---|---|---|

## Generated content

*None yet.* AI-generated art, audio or code goes here with the tool and date.

| Item | Tool | Date | Notes |
|---|---|---|---|

---

## Planned dependencies, and their terms

Verified during technical research. Not yet in the repository — record them
properly here when they arrive.

| Project | Licence | Obligation on use |
|---|---|---|
| Babylon.js | Apache-2.0 | Retain the licence and any upstream NOTICE content. |
| Mission Pinball Framework | MIT (docs CC BY 4.0) | Include its copyright and permission notice if its ontology, naming, or event vocabulary is adopted. |
| vpdb/vpx-js | GPL-2.0-**or-later** | **Preserve its copyright notices alongside ours.** We exercise the or-later clause to combine it with Apache-2.0 dependencies under GPL-3.0. |
| vbousquet/pinball-parts | CC BY-SA, except a "Thin Film Interaction" node group under CC BY-NC-SA 4.0 | Attribute; **exclude the non-commercial node group.** |
| vpinball/vpinball | Dual — GPLv3+ only where the first line reads `// license:GPLv3+`; otherwise MAME-derived non-commercial | Check **every file individually**. Unmarked files cannot be used. |
| vpinball/pinmame | MAME-derived, "strictly a non-profit project" | **Do not use.** Not needed — DragonWar is an original table with no ROM emulation. |

---

## Where to get assets that are safe to use

The practical answer to "how do I make this free without stepping on anyone."
Always check the individual item's licence — a permissive site can still host a
restrictively-licensed file.

**3D models** — Poly Haven (CC0) · Kenney.nl (CC0) · Sketchfab, filtered to
CC0/CC BY · Blender's own bundled assets · anything you model yourself.

**Textures and materials** — Poly Haven (CC0) · ambientCG (CC0) ·
Blender procedural materials.

**Audio** — Freesound, filtered to CC0 (its CC BY and sampling-plus licences
carry conditions worth reading) · Kenney's audio packs (CC0) ·
sounds you record yourself. A pinball machine's mechanical sounds are unusually
easy to record on a phone at the bar, and the result is unambiguously yours.

**Music** — Kevin MacLeod / incompetech (CC BY, attribution required) ·
Free Music Archive, filtered by licence · commissioned or self-composed.

**Fonts** — Google Fonts (OFL/Apache) · Open Font Library. Note that many
retro and DMD-style fonts are commercial or unlicensed; check before using one.

**Avoid entirely** — Google Images, Pinterest, asset sites with no stated
licence, ripped commercial game assets, and anything scraped from real pinball
machines.

*Recording your own reference machine's sounds, and using real published
dimensions, is both cheaper and safer than sourcing either.*
