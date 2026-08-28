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
import { CONTACT_SURFACES } from '../src/sim/contracts';
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
		// validates every authored `surface` property against, so its ORDER and
		// membership are a runtime contract with a real downstream consumer.
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
		const view: ModeView = { mode: 'skillshot', priority: 200, player: 0, timerTicks: 500 };
		expect(view.mode).toBe('skillshot');
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
