// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-1, AD-11: the name unions, derived from `typeof TABLE` so an unknown
// device name is a `pnpm typecheck` failure rather than a runtime surprise
// (this story's "Name unions bind to TABLE" I/O-matrix row). `sim/table` may
// import `sim/contracts` (AD-1); this file is the one place that applies
// `TABLE`'s unions to every seam-contract type generic over a device name,
// so every other consumer has exactly one import site for a device-typed
// seam value instead of re-instantiating the generic itself.

import { TABLE } from './dragonwar';
import type { ResolvedTuning } from './tuning';
import type {
	CoilCommand as ContractsCoilCommand,
	ContactEvent as ContractsContactEvent,
	FlasherCommand as ContractsFlasherCommand,
	FrameOutput as ContractsFrameOutput,
	GameStart as ContractsGameStart,
	GameState as ContractsGameState,
	GiCommand as ContractsGiCommand,
	LampCommand as ContractsLampCommand,
	MachineState as ContractsMachineState,
	MechanismsSnapshot as ContractsMechanismsSnapshot,
	ReplayHeader as ContractsReplayHeader,
	Replay as ContractsReplay,
	SemanticEvent as ContractsSemanticEvent,
	ShowCommand as ContractsShowCommand,
	Snapshot as ContractsSnapshot,
	SwitchEvent as ContractsSwitchEvent,
} from '../contracts';

export type SwitchName = keyof typeof TABLE.switches;
export type CoilName = keyof typeof TABLE.coils;
export type LampName = keyof typeof TABLE.lamps;
export type GiChannel = keyof typeof TABLE.giChannels;
export type FlasherName = keyof typeof TABLE.flashers;
export type ShowName = keyof typeof TABLE.shows;
export type ShotName = keyof typeof TABLE.shots;
export type BallDeviceName = keyof typeof TABLE.ballDevices;

/**
 * `ContactEvent`/`SemanticEvent`'s `device` field may name a coil (`coil_fire`,
 * `eject`) or a ball device/mechanism (`drop_target_down`, `bank_reset`,
 * `spinner_tick`, `device_overflow`, `broken`) depending on the actuation or
 * failure kind -- not one of the eight name unions above on its own, so this
 * file binds it to the union of the two that apply.
 */
type DeviceName = CoilName | BallDeviceName;

// ---- Bound seam aliases -----------------------------------------------
// Every seam-contract type generic over a device name, applied to TABLE's
// unions and re-exported under its plain contract name.

export type SwitchEvent = ContractsSwitchEvent<SwitchName>;
export type ContactEvent = ContractsContactEvent<DeviceName>;
export type SemanticEvent = ContractsSemanticEvent<BallDeviceName, DeviceName>;
export type CoilCommand = ContractsCoilCommand<CoilName>;
export type LampCommand = ContractsLampCommand<LampName>;
export type GiCommand = ContractsGiCommand<GiChannel>;
export type FlasherCommand = ContractsFlasherCommand<FlasherName>;
export type ShowCommand = ContractsShowCommand<ShowName>;
export type MechanismsSnapshot = ContractsMechanismsSnapshot<BallDeviceName>;
export type Snapshot = ContractsSnapshot<BallDeviceName>;
export type FrameOutput = ContractsFrameOutput<BallDeviceName, DeviceName, LampName, GiChannel, FlasherName, ShowName>;
export type MachineState = ContractsMachineState<BallDeviceName>;
export type GameState = ContractsGameState<BallDeviceName>;

// Story 1.8: `sim/contracts/replay.ts:26-28` claims this file binds
// `GameStart`/`ReplayHeader`'s `TTuning` generic to the resolved tuning
// shape -- true now, previously an unfulfilled claim (grep was empty; this
// story's Code Map, "The replay surface to build on"). Bound to
// `ResolvedTuning` (`sim/table/tuning.ts`'s `resolveTuning()` return type),
// the same table-free generic-parameterisation pattern every other bound
// alias above already follows.
export type GameStart = ContractsGameStart<ResolvedTuning>;
export type ReplayHeader = ContractsReplayHeader<ResolvedTuning>;
export type Replay = ContractsReplay<ResolvedTuning>;
