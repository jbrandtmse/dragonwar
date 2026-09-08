// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-9: the closed command union. Rules -> physics: CoilCommand, RecoverCommand.
// Rules -> presentation: LampCommand, GiCommand, FlasherCommand, ShowCommand.
// This file is table-free (AD-1): every type that names a device is generic
// over the relevant name union, bound to TABLE only in sim/table/names.ts.

/** A device eject is `pulse` on the ball device's `ejectCoil`; Tilt/game-over/Attract `disable` every hardware coil together (AD-5). */
export type CoilAction = 'pulse' | 'enable' | 'disable';

/** Rules -> physics: fire, enable or disable a named coil (AD-9). */
export interface CoilCommand<TCoil extends string = string> {
	readonly type: 'coil';
	readonly coil: TCoil;
	readonly action: CoilAction;
	readonly tick: number;
}

/** Rules -> physics, ball-search final stage only: physics's one licence to despawn a loose ball (AD-6). */
export interface RecoverCommand {
	readonly type: 'recover';
	readonly tick: number;
}

/**
 * The closed role set AD-9 names, as a RUNTIME value (Story 2.8, the
 * `CONTACT_SURFACES` idiom -- `contracts/events.ts:30-46`): a lamp role is
 * never a colour, so this list is the seven values `lampsOf(state)` may ever
 * emit, no more and no fewer. `LampRole` below is re-derived from it so the
 * type and the runtime closure test (`test/contracts.test.ts`) can never
 * silently drift apart.
 */
export const LAMP_ROLES = ['off', 'lit', 'hurryup', 'quickmb', 'joust', 'dragon', 'special'] as const;

/**
 * `role` is never a colour (AD-9): `presentation/lighting/grammar.ts` is the
 * one `(role, step)` -> RGB/intensity/cadence table. The closed role set
 * named by AD-9's own rule text.
 */
export type LampRole = (typeof LAMP_ROLES)[number];

/** The only progression rules may express for a lamp: off, lit, emphasised, urgent (AD-9). */
export type LampStep = 0 | 1 | 2 | 3;

/** Rules -> presentation: the diff of `lampsOf(state)` (AD-9). */
export interface LampCommand<TLamp extends string = string> {
	readonly type: 'lamp';
	readonly lamp: TLamp;
	readonly role: LampRole;
	readonly step: LampStep;
	readonly tick: number;
}

/** One lamp's current projected state (Story 2.8, AD-9): `lampsOf(state)`'s own per-lamp value, computed fresh every rules step -- `sim/loop` diffs consecutive values of this into the `LampCommand`s above; it is never itself sent anywhere. */
export interface LampProjectionEntry {
	readonly role: LampRole;
	readonly step: LampStep;
}

/** `lampsOf(state, ballSaveHurryUpTicks): LampState` (Story 2.8, AD-9): every `TABLE.lamps` key's current `{ role, step }` -- recomputed whole every step, never mutated in place. Pure, but NOT of `GameState` alone since Story 2.9: `l_ball_save`'s hurry-up span needs a tuning-derived tick count, which the loop resolves once and threads in rather than adding a field to the hashed `GameState`. A caller that omits it gets no hurry-up span at all. */
export type LampState<TLamp extends string = string> = Readonly<Record<TLamp, LampProjectionEntry>>;

/** Rules -> presentation: the only continuous light level; latest wins per channel (AD-9). */
export interface GiCommand<TGiChannel extends string = string> {
	readonly type: 'gi';
	readonly channel: TGiChannel;
	readonly level: number;
	readonly tick: number;
}

/** Rules -> presentation: coil-class, the only wall-time duration a command carries; the flasher driver enforces duty cycle (AD-9). */
export interface FlasherCommand<TFlasher extends string = string> {
	readonly type: 'flasher';
	readonly flasher: TFlasher;
	readonly ms: number;
	readonly tick: number;
}

/** Rules -> presentation: a named non-lamp effect -- audio cue or mechanism animation alike (AD-9). */
export interface ShowCommand<TShow extends string = string> {
	readonly type: 'show';
	readonly show: TShow;
	readonly tick: number;
}
