// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0
// Fixture: no-literal-non-ascii must NOT fire here -- this file carries the
// port marker every DW-79-frozen port declares, so its literal non-ASCII
// byte (a stand-in for an upstream author's own character, §) is exempt
// (Rule 14 exempts declared ports; their bytes are not ours to re-encode).
export const upstreamRatio = 'ratio §';
