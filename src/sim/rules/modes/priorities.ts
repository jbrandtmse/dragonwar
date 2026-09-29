// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 3.1 (AD-8): the once-declared priority table. Every mode's priority
// is read from here and nowhere else -- `BASE_MODE_PRIORITY` and
// `SKILL_SHOT_MODE_PRIORITY` (`./base.ts`, `./skill-shot.ts`) are this
// table's own entries, and `createModeStack()` (`./index.ts`) refuses at
// construction any definition whose priority is not its name's entry here.
// Mode names follow `machine.multiball` (`'quickmb' | 'war'`) and the lamp
// roles (`hurryup`, `quickmb`, `joust`).

/** AD-8: unique numeric priorities -- base 100, skill shot 200, Hurry-up 300, Joust 310, Quick multiball 400, the War 500. */
export const MODE_PRIORITIES = {
	base: 100,
	skill_shot: 200,
	hurryup: 300,
	joust: 310,
	quickmb: 400,
	war: 500,
} as const;

/** Every mode name the stack can register -- derived from the table, never a second hand-typed union. */
export type ModeName = keyof typeof MODE_PRIORITIES;
