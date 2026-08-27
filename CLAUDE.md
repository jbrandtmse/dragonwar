# DragonWar

An open-source pinball simulation: one table, browser-first, Windows and macOS.
Licensed **GPL-3.0**. See `LICENSE`, `NOTICE`, and `ATTRIBUTIONS.md`.

Planning artifacts live in `_bmad-output/planning-artifacts/` — the technical
research (stack decision, physics approach, machine specifications) and the
product brief (scope, rules spine, success criteria). Read those before making
architectural decisions; they are cited and were adversarially reviewed.

---

## Rule: nothing enters this repository without known provenance

This project must stay free to distribute and must not infringe anyone's
copyright. That is a hard requirement, not a preference. It is cheap to
maintain from the first commit and expensive to repair later.

**Before adding any third-party file — code, 3D model, texture, sound, music,
font, icon — or pasting any third-party code into a source file:**

1. **Record it in `ATTRIBUTIONS.md` first.** Source URL, author, licence, and
   the date the licence was verified. The entry goes in before the file does.
2. **Verify the licence at its source.** Read the actual LICENSE file or the
   licence field on the page you took it from. Do not rely on a package
   manager's metadata field, a wiki summary, or an aggregator — this project
   already found one case where `package.json` said `GPL-2.0` while the source
   headers granted `GPL-2.0-or-later`, and the difference decided the whole
   licensing plan.
3. **If you cannot establish the licence, do not add the file.** No exception.
   "Found it on Google Images" and "it was on a forum" are not licences.

**Acceptable:** GPL-3.0 · GPL-2.0-or-later · LGPL · MIT · Apache-2.0 · BSD ·
CC0 / public domain · CC BY · CC BY-SA (assets).

**Not acceptable — do not add:**

- **Anything with no licence stated.** Absence of a licence means all rights
  reserved, not permission. This is the most common mistake.
- **Anything non-commercial** (`CC BY-NC`, `CC BY-NC-SA`, MAME-style
  non-commercial terms). GPL-3.0 permits commercial use, so an NC component
  makes the whole work undistributable under our own licence.
- **GPL-2.0-only.** It conflicts with our Apache-2.0 dependencies.
- **Assets from commercial pinball machines** — playfield art, sculpted toys,
  logos, sound and speech, ROMs. DragonWar is an original table and needs none
  of it.
  The one exception: recordings the author makes of a real machine's generic
  mechanical noises (coil fires, flipper snap, ball rolling on wood) carry no
  copyrightable expression and may be added, recorded in `ATTRIBUTIONS.md` as
  author-made with the date. Speech, music, callouts and any produced audio
  from a commercial machine remain out.

**Two project-specific traps:**

- **`vpinball/vpinball` is dual-licensed mid-migration.** A file is GPLv3+ only
  if its first line reads `// license:GPLv3+`. Unmarked files carry MAME-derived
  terms that forbid commercial use and cannot be used here. Check every file
  individually; do not assume the repository's licence applies.
- **Porting from `vpdb/vpx-js` inherits its authorship.** Preserve its copyright
  notices alongside ours — do not replace them. Stripping them breaks the licence
  grant the port depends on.

**Generated assets** (AI-generated art, audio, or code) are recorded too: name
the tool and the date in `ATTRIBUTIONS.md`. Provenance means knowing where
everything came from, including from us.

**When in doubt, ask rather than guess.** An hour spent checking beats a
rewrite, and there is no deadline here worth infringing for.
