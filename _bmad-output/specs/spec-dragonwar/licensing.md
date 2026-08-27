# Licensing

The provenance rule itself is in the project `CLAUDE.md` (adopted companion). This file holds the verified compatibility chain and the per-component conditions. Verified 2026-08-26 at source; not legal advice. Re-check whenever the renderer or the physics source changes.

## Why GPL-3.0

The licence is a compatibility chain, not a preference:

- `vpdb/vpx-js` source headers grant **GPL-2.0-or-later** ("either version 2 of the License, or (at your option) any later version"); its `package.json` says only `GPL-2.0` and its `LICENSE` is the GPLv2 text — **do not rely on package metadata**.
- Babylon.js is **Apache-2.0**, which is incompatible with GPL-2.0-only but compatible with GPL-3.0.
- Exercising vpx-js's *or-later* clause lets the ported physics and the renderer ship in one program under GPL-3.0. Had vpx-js been GPL-2.0-only, the chosen renderer and the chosen physics core could not have been combined.
- MPF is MIT (docs CC BY 4.0). GPL-3.0 is the only licence above all three, and copyleft keeps the work free downstream.

## Component table

| Component | Licence | Usable | Condition |
| --- | --- | --- | --- |
| DragonWar | GPL-3.0 | — | New files carry the GPL-3.0 header. |
| `vpdb/vpx-js` (commit `e8a6d6f`) | GPL-2.0-or-later per source headers | Yes | Port under `src/sim/physics/`; **preserve every original copyright header** plus `// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0`; checked per file in CI. Stripping a notice breaks the grant the port depends on. Source paths: `lib/physics/`, `lib/vpt/ball/`, `lib/vpt/flipper/`, `lib/game/player-physics.ts` — headers checked per file. |
| Babylon.js (`@babylonjs/core`, `@babylonjs/loaders`) | Apache-2.0 | Yes | `@babylonjs/havok` is banned everywhere (engine physics must not creep in). |
| Mission Pinball Framework v0.80.0 | MIT (docs CC BY 4.0) | Yes | Ontology and event vocabulary adopted wholesale; no code. |
| `freezy/VisualPinball.Engine` | GPL-3.0 | Yes | Reference for VPX-physics-in-an-engine. |
| `vpinball/vpinball` | Dual; GitHub NOASSERTION | Per file | Only files whose first line reads `// license:GPLv3+`. Unmarked files carry MAME-derived terms ("may not be sold, nor … used in a commercial product or activity"). Algorithms as documented behaviour are safe to learn from. |
| `vpinball/pinmame` | Non-profit only | No | Out of scope; an original table needs no ROMs. |
| `neophob/wpc-emu` | Apache-2.0 | Yes | Not needed. |
| `vbousquet/pinball-parts` | CC BY-SA (one NC-SA node group) | Assets yes | Exclude the NC-SA node group. |
| `vbousquet/vpx_lightmapper` | Not stated in the research | Technique only | Verify the licence before any code use. |
| A Bally playfield template drawing (DXF/SVG) | — | Not sourced | Decided 2026-08-27: geometry is drawn from the reference dimensions alone. If that ever changes, a template needs a verified licence and an `ATTRIBUTIONS.md` entry like any other asset. |
| Stern *Dungeons & Dragons* (the Reference machine) | Commercial machine | Feel reference only | Play it, compare, tune. No art, toys, audio, speech, rules text or logos; the author's own recordings of its generic mechanical noises are the one carve-out. |
| Author's recordings of the Reference machine | Author-made | Yes | Generic mechanical noise only — coil fires, flipper snap, ball on wood — carries no copyrightable expression. Never speech, music, callouts or produced audio. Recorded in `ATTRIBUTIONS.md` as author-made with the date. |
| Generated assets (AI art, audio, code) | — | Yes | Recorded with tool and date in `ATTRIBUTIONS.md`. |

## Acceptable and not

Acceptable: GPL-3.0 · GPL-2.0-or-later · LGPL · MIT · Apache-2.0 · BSD · CC0 / public domain · CC BY · CC BY-SA (assets).

Not acceptable: anything with no licence stated; anything non-commercial (CC BY-NC, NC-SA, MAME-style terms); GPL-2.0-only; any asset from a commercial pinball machine (playfield art, sculpted toys, logos, speech, music, callouts, ROMs).
