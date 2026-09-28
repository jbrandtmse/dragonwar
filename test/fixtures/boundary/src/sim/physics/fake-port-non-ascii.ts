// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Fixture: a "// Ported from " marker appearing on a LATER line-comment,
// never this file's own FIRST line-comment, must NOT exempt this file from
// Rule 14 -- only a file's own first "//"-style comment counts as its
// declared-port marker (tools/boundary-lint.mjs's isDeclaredPort()). Every
// real DW-79-frozen port's marker sits on its own genuine first line-comment
// (verified against all 41 files in test/port-provenance.test.ts's
// PORT_BODY_HASHES); this file's marker text is a decoy planted deeper in.
// Ported from nowhere-real (not-a-real-licence); this line is NOT this
// file's first "//" comment and must never exempt anything.
export const notActuallyAPort = 'still catches this: §';
