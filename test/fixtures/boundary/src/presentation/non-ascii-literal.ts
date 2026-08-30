// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: no-literal-non-ascii (Rule 14). A non-ASCII byte
// belongs only as a \uXXXX escape.
//
// Also exercises the I/O matrix's "same codepoint in a comment does not
// fire" control: this comment names the section sign, §, a real non-ASCII
// character, and must NOT be flagged -- only the actual string literal
// below may be.
export const label = 'addendum §2';
