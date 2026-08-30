/* DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
   A BLOCK-comment licence header on purpose: isDeclaredPort() skips
   block-comment tokens, so the port marker below is still this file's own
   FIRST line-comment. That is the one shape the doc comment on
   isDeclaredPort() claims to allow and nothing else exercises. */
// Ported from nowhere-real (not-a-real-licence); fixture only -- this file
// is DragonWar-authored and is NOT ported from vpdb/vpx-js. Naming a real
// upstream here would put a false provenance claim in the tracked tree
// (CLAUDE.md: nothing enters this repository without known provenance) and
// would satisfy tools/check-licence-headers.mjs on a claim that is untrue.
// Fixture: no-literal-non-ascii must NOT fire here -- this file carries the
// port marker every DW-79-frozen port declares, so its literal non-ASCII
// byte (a stand-in for an upstream author's own character, §) is exempt
// (Rule 14 exempts declared ports; their bytes are not ours to re-encode).
export const upstreamRatio = 'ratio §';
