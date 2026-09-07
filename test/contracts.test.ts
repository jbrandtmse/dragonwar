// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.3's second acceptance criterion: src/sim/contracts/ exports every
// named seam type, discriminated on `type`, every event and command carrying
// `tick`. Each type is exercised by constructing a real literal of its shape
// (so a missing/mistyped field fails `pnpm typecheck`, the gate this suite
// cannot bypass) and asserting its discriminant at runtime -- not merely
// `typeof X !== 'undefined'`, which a type-only export could never satisfy
// anyway (TypeScript types have no runtime representation).

import { describe, expect, it } from 'vitest';
import { CONTACT_SURFACES, LAMP_ROLES } from '../src/sim/contracts';
import type {
	ContactEvent,
	ContactSurface,
	CoilCommand,
	FlasherCommand,
	FrameOutput,
	GameStart,
	GiCommand,
	InputAction,
	InputFrame,
	InputTransition,
	LampCommand,
	LampProjectionEntry,
	LampRole,
	LampState,
	ModeView,
	RecoverCommand,
	ReplayHeader,
	SemanticEvent,
	ShowCommand,
	Snapshot,
	SwitchEvent,
} from '../src/sim/contracts';

describe('sim/contracts -- InputAction / InputFrame / InputTransition', () => {
	it('InputFrame is a full bitset over every InputAction; InputTransition carries tick + frame', () => {
		const actions: InputAction[] = ['flipper_l', 'flipper_r', 'plunger', 'nudge_l', 'nudge_r', 'nudge_up', 'start', 'menu'];
		const frame: InputFrame = {
			flipper_l: true,
			flipper_r: false,
			plunger: false,
			nudge_l: false,
			nudge_r: false,
			nudge_up: false,
			start: false,
			menu: false,
		};
		for (const action of actions) {
			expect(typeof frame[action]).toBe('boolean');
		}
		const transition: InputTransition = { tick: 42, frame };
		expect(transition.tick).toBe(42);
		expect(transition.frame.flipper_l).toBe(true);
	});
});

describe('sim/contracts -- SwitchEvent', () => {
	it('is discriminated on type "switch" and carries switch/closed/tick', () => {
		const event: SwitchEvent<'s_start'> = { type: 'switch', switch: 's_start', closed: true, tick: 7 };
		expect(event.type).toBe('switch');
		expect(event.switch).toBe('s_start');
		expect(event.tick).toBe(7);
	});
});

describe('sim/contracts -- ContactSurface / ContactEvent', () => {
	it('ContactSurface is the closed material enum', () => {
		const surfaces: ContactSurface[] = ['wood', 'rubber_post', 'rubber_band', 'metal', 'plastic', 'ramp', 'flipper', 'target', 'bumper', 'glass', 'ball', 'dragon'];
		expect(surfaces).toHaveLength(12);
	});

	it('CONTACT_SURFACES pins the twelve members AND their order at runtime, not just at the type level', () => {
		// The literal above is typed `ContactSurface[]`, so it is a COMPILE-time
		// check over the test's own text: it never reads CONTACT_SURFACES, and
		// adding a thirteenth member or reordering the array broke nothing
		// (review finding, Story 1.4's code-review pass). Since Story 1.4 that
		// array is serialised into the table-contract dump `tools/export.py`
		// validates every authored `surface` property against, so its
		// MEMBERSHIP is a runtime contract with a real downstream consumer.
		// Its ORDER is pinned here too, but as a deliberate belt-and-braces
		// against a silent edit -- not because a consumer depends on it:
		// export.py reads the dump as `set(dump['surfaces'])` and discards the
		// order entirely (re-review finding -- the justification originally
		// written here claimed otherwise).
		expect(CONTACT_SURFACES).toEqual([
			'wood', 'rubber_post', 'rubber_band', 'metal', 'plastic', 'ramp',
			'flipper', 'target', 'bumper', 'glass', 'ball', 'dragon',
		]);
	});

	it('ContactEvent is discriminated on type "contact" and carries tick', () => {
		const event: ContactEvent = { type: 'contact', kind: 'hit', ballId: 1, speed: 3.2, surface: 'wood', tick: 100 };
		expect(event.type).toBe('contact');
		expect(event.kind).toBe('hit');
		expect(event.tick).toBe(100);
	});
});

describe('sim/contracts -- commands are discriminated on type and carry tick', () => {
	it('CoilCommand', () => {
		const cmd: CoilCommand<'c_flipper_l'> = { type: 'coil', coil: 'c_flipper_l', action: 'pulse', tick: 1 };
		expect(cmd.type).toBe('coil');
		expect(cmd.tick).toBe(1);
	});

	it('RecoverCommand', () => {
		const cmd: RecoverCommand = { type: 'recover', tick: 2 };
		expect(cmd.type).toBe('recover');
		expect(cmd.tick).toBe(2);
	});

	it('LampCommand', () => {
		const cmd: LampCommand<'l_dummy'> = { type: 'lamp', lamp: 'l_dummy', role: 'lit', step: 1, tick: 3 };
		expect(cmd.type).toBe('lamp');
		expect(cmd.tick).toBe(3);
	});

	// Story 2.8 (AC 2): `LAMP_ROLES` pins the seven AD-9 role members AND
	// their order at runtime -- the `CONTACT_SURFACES` shape above, copied.
	// `LampRole` had no runtime representation before this story (Code Map:
	// "LampRole currently has no runtime representation, which is why AC 2's
	// closure test is not satisfiable today").
	it('LAMP_ROLES pins the seven AD-9 role members AND their order at runtime, not just at the type level', () => {
		const roles: LampRole[] = ['off', 'lit', 'hurryup', 'quickmb', 'joust', 'dragon', 'special'];
		expect(roles).toHaveLength(7);
		expect(LAMP_ROLES).toEqual(['off', 'lit', 'hurryup', 'quickmb', 'joust', 'dragon', 'special']);
	});

	it('rejects an eighth role value at compile time (LampRole is closed to the seven AD-9 members)', () => {
		// @ts-expect-error -- 'nonexistent_role' is not one of AD-9's seven roles.
		const role: LampRole = 'nonexistent_role';
		void role;
	});

	// Code review pass 3 (verification-gap, Rule 19): this used to construct
	// `{ l_dummy: entry }` and then assert that same object's own two fields.
	// `LampState`/`LampProjectionEntry` are TYPES with no runtime
	// representation -- as this file's own header says -- so no
	// implementation of anything could redden it, and unlike the neighbouring
	// `toHaveLength(7)` case there was no load-bearing assertion inside the
	// same `it()`. The load-bearing checks are the `@ts-expect-error`
	// directives below, enforced by `pnpm typecheck` (vitest's esbuild
	// transform strips types and never sees them) -- the same enforcement
	// point the role-rejection case above relies on. The runtime assertions
	// are kept only as executable documentation of the shape.
	it('LampState<TLamp> is TOTAL over its lamp union and closed to LampStep (compile-time; runtime lines are shape documentation only)', () => {
		const entry: LampProjectionEntry = { role: 'dragon', step: 2 };
		const state: LampState<'l_dummy'> = { l_dummy: entry };
		expect(state.l_dummy.role).toBe('dragon');
		expect(state.l_dummy.step).toBe(2);

		// @ts-expect-error -- LampState is a total Record, never Partial: a lamp in the union may not be omitted.
		const missing: LampState<'l_dummy' | 'l_other'> = { l_dummy: entry };
		void missing;

		// @ts-expect-error -- 4 is outside LampStep's closed {0,1,2,3}.
		const badStep: LampProjectionEntry = { role: 'dragon', step: 4 };
		void badStep;

		// @ts-expect-error -- LampProjectionEntry's fields are readonly; the projection is recomputed whole, never mutated in place (AD-9).
		entry.step = 1;
	});

	it('GiCommand', () => {
		const cmd: GiCommand<'gi_backbox'> = { type: 'gi', channel: 'gi_backbox', level: 0.5, tick: 4 };
		expect(cmd.type).toBe('gi');
		expect(cmd.tick).toBe(4);
	});

	it('FlasherCommand', () => {
		const cmd: FlasherCommand<'f_dummy'> = { type: 'flasher', flasher: 'f_dummy', ms: 50, tick: 5 };
		expect(cmd.type).toBe('flasher');
		expect(cmd.tick).toBe(5);
	});

	it('ShowCommand', () => {
		const cmd: ShowCommand<'show_dummy'> = { type: 'show', show: 'show_dummy', tick: 6 };
		expect(cmd.type).toBe('show');
		expect(cmd.tick).toBe(6);
	});
});

describe('sim/contracts -- SemanticEvent is discriminated on type and every variant carries tick', () => {
	it('sim_time_discarded', () => {
		const event: SemanticEvent = { type: 'sim_time_discarded', ms: 250, tick: 10 };
		expect(event.type).toBe('sim_time_discarded');
	});

	it('ball_started (Story 2.5, AC 2: the third member of ball_will_start -> ball_starting -> ball_started)', () => {
		const event: SemanticEvent = { type: 'ball_started', tick: 21 };
		expect(event.type).toBe('ball_started');
	});

	it('ball_ended carries the AD-9-named payload', () => {
		const event: SemanticEvent = {
			type: 'ball_ended',
			player: 0,
			bonusByCategory: { loops: 3 },
			multiplier: 2,
			total: 6,
			tilted: false,
			tick: 20,
		};
		expect(event.type).toBe('ball_ended');
	});

	it('the device-failure vocabulary exists even though Epic 1 never emits it', () => {
		const failed: SemanticEvent = { type: 'eject_failed', device: 'bd_trough', tick: 30 };
		const broken: SemanticEvent = { type: 'broken', device: 'c_flipper_l', tick: 31 };
		const overflow: SemanticEvent = { type: 'device_overflow', device: 'bd_trough', tick: 32 };
		expect([failed.type, broken.type, overflow.type]).toEqual(['eject_failed', 'broken', 'device_overflow']);
	});

	it('narrows exhaustively on type (a discriminated union, not an open one)', () => {
		function describeEvent(event: SemanticEvent): string {
			switch (event.type) {
				case 'sim_time_discarded':
					return `discarded ${event.ms}ms`;
				case 'ball_will_start':
					return 'ball will start';
				case 'ball_starting':
					return 'ball starting';
				case 'ball_started':
					return 'ball started';
				case 'ball_launched':
					return 'ball launched';
				case 'ball_missing':
					return `missing ${event.count}`;
				case 'ball_ended':
					return `ended ${event.total}`;
				case 'eject_failed':
					return `eject failed ${event.device}`;
				case 'broken':
					return `broken ${event.device}`;
				case 'device_overflow':
					return `overflow ${event.device}`;
				default: {
					// Exhaustiveness: if a new event variant is ever added without a
					// case above, this line fails `pnpm typecheck`.
					const neverEvent: never = event;
					return String(neverEvent);
				}
			}
		}
		expect(describeEvent({ type: 'ball_will_start', tick: 1 })).toBe('ball will start');
	});
});

describe('sim/contracts -- Snapshot / FrameOutput / ModeView', () => {
	it('Snapshot carries tick, balls, mechanisms, game and effectivePitchDeg', () => {
		const snapshot: Snapshot = {
			tick: 1,
			balls: [{ id: 1, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, speed: 0 }],
			mechanisms: {
				flippers: {
					l: { angleDeg: 0, angularVelDegPerSec: 0 },
					r: { angleDeg: 0, angularVelDegPerSec: 0 },
				},
				plunger: { posMm: 0, holdTicks: 0 },
				dropTargets: {},
				spinner: {},
				devices: {},
			},
			game: {
				tick: 1,
				phase: 'attract',
				machine: {
					ballsInPlay: 0,
					hardwareEnabled: false,
					ballSave: { untilTick: null, sources: [] },
					tilt: { tilted: false, slamTilted: false },
					multiball: null,
					highscores: [],
					deviceSlots: {},
				},
				players: [],
				currentPlayer: 0,
				modes: [],
				rng: 1,
			},
			effectivePitchDeg: 6.5,
		};
		expect(snapshot.tick).toBe(1);
		expect(snapshot.effectivePitchDeg).toBe(6.5);
	});

	it('FrameOutput carries snapshot, events, contactEvents and commands, empty for N = 0', () => {
		const before: Snapshot = {
			tick: 5,
			balls: [],
			mechanisms: {
				flippers: { l: { angleDeg: 0, angularVelDegPerSec: 0 }, r: { angleDeg: 0, angularVelDegPerSec: 0 } },
				plunger: { posMm: 0, holdTicks: 0 },
				dropTargets: {},
				spinner: {},
				devices: {},
			},
			game: {
				tick: 5,
				phase: 'game',
				machine: {
					ballsInPlay: 1,
					hardwareEnabled: true,
					ballSave: { untilTick: null, sources: [] },
					tilt: { tilted: false, slamTilted: false },
					multiball: null,
					highscores: [],
					deviceSlots: {},
				},
				players: [],
				currentPlayer: 0,
				modes: [],
				rng: 1,
			},
			effectivePitchDeg: 6.5,
		};
		const frameOutput: FrameOutput = { snapshot: before, events: [], contactEvents: [], commands: [] };
		expect(frameOutput.events).toEqual([]);
		expect(frameOutput.contactEvents).toEqual([]);
		expect(frameOutput.commands).toEqual([]);
		expect(frameOutput.snapshot).toBe(before);
	});

	it('ModeView is the only shape of an active mode presentation may read', () => {
		// Story 2.7 QA stage (Rule 19): the previous version of this test
		// (`const view: ModeView = { mode: 'skill_shot', ... }; expect(view.mode)
		// .toBe('skill_shot')`) asserted a literal against the value assigned to
		// the very same field two lines above -- it could not go red for any
		// change to ModeView's shape, including deleting the interface's `mode`
		// field entirely (only `pnpm typecheck` would ever have caught that, and
		// nothing routed the assertion there). Replaced with checks that are
		// actually falsifiable at the boundary this interface exists to police
		// (AD-9: "ModeView is the only shape of `modes[i]` presentation may
		// read"), using the `@ts-expect-error` convention `table.test.ts`
		// already established for this codebase's other name-union contracts --
		// caught by `pnpm typecheck`, since vitest's esbuild transform strips
		// types and never sees these directives.
		const minimal: ModeView = { mode: 'base', priority: 100, player: 0 };
		expect(minimal.timerTicks, 'the four extra fields are genuinely optional, not merely defaulted').toBeUndefined();

		const full: ModeView = { mode: 'skill_shot', priority: 200, player: 1, timerTicks: 500, value: 3, charge: 0.5, strikesRemaining: 2 };
		expect(Object.keys(full).sort()).toEqual(['charge', 'mode', 'player', 'priority', 'strikesRemaining', 'timerTicks', 'value']);

		// @ts-expect-error -- `mode` is required; omitting it must fail
		// typecheck. A version of ModeView that made `mode` optional would make
		// this line compile silently and this directive would report an unused
		// '@ts-expect-error'.
		const missingMode: ModeView = { priority: 200, player: 0 };
		void missingMode;

		// @ts-expect-error -- AD-9: ModeView is the ONLY shape presentation may
		// read. `launched` is a real mode-local field (the skill-shot mode's own
		// launch gate, carried on `ActiveModeState`'s open index signature,
		// Story 2.7) that must NOT be readable through ModeView -- if ModeView
		// ever grew an index signature of its own (mirroring ActiveModeState's),
		// this line would compile and the directive above would report unused.
		const leaked: ModeView = { mode: 'skill_shot', priority: 200, player: 0, launched: true };
		void leaked;
	});
});

describe('sim/contracts -- GameStart / ReplayHeader', () => {
	it('GameStart carries seed, tuning, adjustments and highscores', () => {
		const gameStart: GameStart<{ dummy: true }> = {
			seed: 1,
			tuning: { dummy: true },
			adjustments: { pitchDeg: 6.5, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 },
			highscores: [{ initials: 'AAA', score: 1000 }],
		};
		expect(gameStart.seed).toBe(1);
		expect(gameStart.highscores[0]?.initials).toBe('AAA');
	});

	it('ReplayHeader embeds the whole GameStart plus physicsSeed/tickHz/tableHash/assetHash/physicsVersion', () => {
		const header: ReplayHeader<{ dummy: true }> = {
			gameStart: {
				seed: 1,
				tuning: { dummy: true },
				adjustments: { pitchDeg: 6.5, tiltWarnings: 1, ballsPerGame: 3, matchProbability: 0.08 },
				highscores: [],
			},
			physicsSeed: 2,
			tickHz: 1000,
			tableHash: 'abc',
			assetHash: 'def',
			physicsVersion: '1.0.0',
		};
		expect(header.tickHz).toBe(1000);
		expect(header.gameStart.seed).toBe(1);
	});
});
