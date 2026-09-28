// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// A trivial, otherwise-valid sim/table/ file -- exists only as a real
// export source for the switch-event-leak fixture's `SwitchEvent` import
// (test/boundary-lint.test.ts, rule "rules-no-switch-event-outside-devices").
export interface SwitchEvent {
	readonly type: 'switch';
	readonly switch: string;
	readonly closed: boolean;
	readonly tick: number;
}
