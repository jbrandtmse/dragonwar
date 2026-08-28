// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-4, AD-10: one continuous-display snapshot per frame; presentation
// renders the latest snapshot without interpolation and never derives game
// state from anything but `game: Readonly<GameState>`. This file is
// table-free (AD-1); device-naming fields are generic, bound to TABLE only in
// sim/table/names.ts.
//
// `mechanisms` carries the five keys the spine's Structural Seed names for
// `presentation/mechanisms/` (flippers, drop targets, spinner, plunger, and
// devices for the ball-device rig). `flippers`, `plunger` and `devices` carry
// Epic 1's real shapes; `dropTargets` and `spinner` carry only the minimal
// shape the brief's addendum states -- "a target is down or up", "the
// spinner spins and decays" -- so Epic 2 fills them in rather than redefining
// this contract.

import type { ContactEvent, ContactSurface, SemanticEvent } from './events';
import type { FlasherCommand, GiCommand, LampCommand, ShowCommand } from './commands';
import type { GameState } from './state';

/** A table-frame position or velocity vector, millimetres (AD-10). Structured-cloneable. */
export interface Vec3Mm {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/** One simulated ball's continuous-display state. `id` is the ball instance identifier, not a `TABLE` name (AD-6/8). */
export interface BallSnapshot {
	readonly id: number;
	readonly pos: Vec3Mm;
	readonly vel: Vec3Mm;
	readonly speed: number;
	/** Absent while the ball is not touching a collidable surface. */
	readonly surface?: ContactSurface;
}

/** One flipper's continuous-display state, keyed by side. Epic 1's real shape. */
export interface FlipperMechanismState {
	readonly angleDeg: number;
	readonly angularVelDegPerSec: number;
}

/** The manual plunger's continuous-display state. Epic 1's real shape. */
export interface PlungerMechanismState {
	readonly posMm: number;
	readonly holdTicks: number;
}

/**
 * AR-15's minimal drop-target shape: down or up. Keyed by switch name once a
 * table has drop targets (none in Epic 1's `TABLE`); left string-keyed here
 * because no drop-target name union exists yet to bind it to.
 */
export type DropTargetMechanismState = Readonly<Record<string, boolean>>;

/** AR-15's minimal spinner shape: it spins and decays. No `TABLE` spinner exists in Epic 1. */
export interface SpinnerMechanismState {
	readonly speed: number;
}

/** A ball device's continuous-display slot occupancy, generic over `BallDeviceName`, in the device's authored fill order. */
export interface BallDeviceMechanismState {
	readonly slots: readonly boolean[];
}

/**
 * The five mechanism keys `presentation/mechanisms/` reads (Structural
 * Seed). Generic over the ball-device name union; the flipper sides are
 * fixed to Epic 1's two hardware flippers (`TABLE.coils.c_flipper_l` /
 * `c_flipper_r`).
 */
export interface MechanismsSnapshot<TBallDevice extends string = string> {
	readonly flippers: Readonly<Record<'l' | 'r', FlipperMechanismState>>;
	readonly plunger: PlungerMechanismState;
	readonly dropTargets: DropTargetMechanismState;
	readonly spinner: Readonly<Record<string, SpinnerMechanismState>>;
	readonly devices: Readonly<Record<TBallDevice, BallDeviceMechanismState>>;
}

/**
 * `{ tick, balls, mechanisms, game: Readonly<GameState>, effectivePitchDeg }`
 * (Seam Contracts table). One per frame; structured-cloneable; presentation
 * renders it without interpolation (AD-4) and reads `game` for anything
 * beyond the continuous physical state above.
 */
export interface Snapshot<TBallDevice extends string = string> {
	readonly tick: number;
	readonly balls: readonly BallSnapshot[];
	readonly mechanisms: MechanismsSnapshot<TBallDevice>;
	readonly game: Readonly<GameState<TBallDevice>>;
	readonly effectivePitchDeg: number;
}

/** The union of every command kind rules may issue to presentation (AD-9). */
export type PresentationCommand<
	TLamp extends string = string,
	TGiChannel extends string = string,
	TFlasher extends string = string,
	TShow extends string = string,
> = LampCommand<TLamp> | GiCommand<TGiChannel> | FlasherCommand<TFlasher> | ShowCommand<TShow>;

/**
 * `{ snapshot, events, contactEvents, commands }` for all N steps of one
 * frame, in tick order (AD-4). N = 0 -> empty arrays, unchanged snapshot.
 * Generic over every device-naming union the events, commands and snapshot
 * it carries may reference; `sim/table/names.ts` binds the concrete alias.
 */
export interface FrameOutput<
	TBallDevice extends string = string,
	TDevice extends string = string,
	TLamp extends string = string,
	TGiChannel extends string = string,
	TFlasher extends string = string,
	TShow extends string = string,
> {
	readonly snapshot: Snapshot<TBallDevice>;
	readonly events: readonly SemanticEvent<TBallDevice, TDevice>[];
	readonly contactEvents: readonly ContactEvent<TDevice>[];
	readonly commands: readonly PresentationCommand<TLamp, TGiChannel, TFlasher, TShow>[];
}
