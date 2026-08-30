// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate fixture, own root (this one makes the tool THROW, which aborts
// the whole run): a regex literal containing a backtick. The tokenizer is not
// regex-literal aware, so the backtick opened a template span that never
// closed and every check for the rest of the file silently saw blanks -- the
// `new Date()` below went unreported and the lint exited 0. It must now fail
// loudly instead.
const re = /[`]/;
export const stamp = new Date();
export const pattern = re;
