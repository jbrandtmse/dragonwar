// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-banned-global (AD-3, AD-16) -- placed AFTER a
// two-interpolation template literal. The tokenizer's brace-tracking stack
// must push a fresh frame for each `${...}` interpolation and pop it at that
// interpolation's own closing `}`; without that, the first `}` consumes the
// frame meant for the literal's closing backtick, the second `}` has nothing
// to pop, and every check after this point in the file is silently blinded
// (review finding, this story's own review pass). This fixture proves the
// real violation below is still caught.
function twoInterpolations(a: string, b: string): string {
	return `first ${a} second ${b} end`;
}
export function now(): number {
	return Date.now();
}
