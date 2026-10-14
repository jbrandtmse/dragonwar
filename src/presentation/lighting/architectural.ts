// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 -- the architectural channel of AD-12's lamp driver: the lamps
// that light the cabinet itself (the backbox behind its translite, the
// cabinet body, the arch panel) rather than the playfield. One light per key
// of `TABLE.giChannels`, in the `(channel, level 0..1)` shape of AD-9's
// `GiCommand`.
//
// What this story builds, and what it leaves:
//  - Blender owns each lamp's POSITION (AD-11): an Empty under
//    `cabinet_root` named exactly as its `TABLE.giChannels` key, authored by
//    `tools/make-placeholder-blend.py`. This file owns what the lamp IS --
//    its targets, colour, intensity and range, in `ARCHITECTURAL_LAMPS`.
//  - `resolveArchitecturalLamps()` creates the lights once per scene, on the
//    host's first render frame. They are never created, disposed, enabled or
//    disabled afterwards: a level is expressed by `intensity` alone, so the
//    light count and every mesh's light list are constant for the scene's
//    whole life (no shader recompile, no transient frame, on a level change).
//  - `setArchitecturalLevel(scene, channel, level)` is the seam. Nothing in
//    this tree emits a `GiCommand` yet, so every channel sits at
//    `ARCHITECTURAL_DEFAULT_LEVEL`; routing `GiCommand { channel, level }` to
//    this seam, the per-frame light cap across all four channels, and the
//    scene's exposure are Story 4.1's.
//
// The traps `lamp-driver.ts` lists apply here too:
//  - a material takes 4 simultaneous lights, and an unscoped light would
//    spend a slot on every mesh in the scene. Each light is therefore scoped
//    with `includedOnlyMeshes` to its authored targets and to nothing else,
//    so a cabinet mesh sees the hemispheric light plus at most one of these;
//  - the cabinet materials use physical (inverse-square) falloff by default,
//    which is unbounded near the lamp. Each light overrides it with the
//    bounded `FALLOFF_STANDARD` and an authored `range`, per light, so no
//    other light or material is affected;
//  - `ShadowLight.getAbsolutePosition()` lies under `NullEngine`: this file
//    never reads it (`test/architectural-lighting.test.ts` asserts each
//    light's world position through `computeWorldMatrix(true)`).
//
// Channel names never appear as string literals here (AD-16): the table
// below is keyed by `GiChannel` with unquoted keys, and every list of
// channels is `Object.keys(TABLE.giChannels)`.
//
// Read-only towards the simulation (AD-1): imports only `sim/table`.

import type { Scene } from '@babylonjs/core/scene';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { getRequiredNode } from '../scene/playfield';
import {
	VIS_CABINET_ARCH_NODE_NAME,
	VIS_CABINET_NODE_NAME,
	VIS_CABINET_RAIL_L_NODE_NAME,
	VIS_CABINET_RAIL_R_NODE_NAME,
	VIS_HEAD_LIGHTBOX_NODE_NAME,
	VIS_LOCKBAR_NODE_NAME,
} from '../scene/vis-names';
import { TABLE } from '../../sim/table/dragonwar';
import type { GiChannel } from '../../sim/table/names';

export interface ArchitecturalLamp {
	/** The meshes this lamp lights, by node name -- and it lights nothing else. */
	readonly targets: readonly string[];
	/** Linear RGB of the lamp's diffuse colour. */
	readonly color: readonly [number, number, number];
	/** The light's intensity at level 1. */
	readonly intensity: number;
	/** The bounded falloff's range, in scene metres. */
	readonly rangeM: number;
}

/**
 * The one authored table of the architectural lamps. The intensities and
 * ranges sit inside the band measured on a dark PBR surface under standard
 * falloff (intensity 1 to 20); the size of each lamp's rendered response is
 * settled in a real browser (the story's AC 9 (d)), and a retune is an edit
 * to this table and to the two typed copies of its intensities, in
 * `test/architectural-lighting.test.ts` and
 * `test/cabinet-live-pipeline.test.ts`, nowhere else.
 *
 * `gi_cabinet`'s intensity is a MEASURED value (author decision 2026-10-13),
 * not a starting one: at 20, 95 % of the lockdown bar's top saturated in
 * Chrome, so a level change could not show there; at 10 the bar's top reads
 * about 201 and the cabinet's front about 132. Those figures were taken on
 * the first build of this cabinet, before its front (and this lamp with it)
 * moved 22 mm toward the player; the story's AC 9 (d) samples the shipped
 * one. `gi_backbox` (20) and `gi_arch` (10) are still the starting values.
 *
 * `gi_backbox` lights the lightbox panel, which is seen THROUGH the
 * translite: a lamp behind an opaque panel lights nothing a player sees, so
 * the translite is made translucent (`scene/cabinet.ts`) and the lamp
 * front-lights a dark panel behind it.
 *
 * Typed `Record<GiChannel, ...>`, so a channel added to `TABLE.giChannels`
 * is a compile error here until it is authored.
 */
export const ARCHITECTURAL_LAMPS: Readonly<Record<GiChannel, ArchitecturalLamp>> = {
	gi_backbox: {
		targets: [VIS_HEAD_LIGHTBOX_NODE_NAME],
		color: [1.0, 0.85, 0.6],
		intensity: 20,
		rangeM: 2.0,
	},
	gi_cabinet: {
		targets: [VIS_CABINET_NODE_NAME, VIS_CABINET_RAIL_L_NODE_NAME, VIS_CABINET_RAIL_R_NODE_NAME, VIS_LOCKBAR_NODE_NAME],
		color: [1.0, 0.85, 0.6],
		intensity: 10,
		rangeM: 3.0,
	},
	gi_arch: {
		targets: [VIS_CABINET_ARCH_NODE_NAME],
		color: [1.0, 0.85, 0.6],
		intensity: 10,
		rangeM: 2.0,
	},
};

/**
 * Every channel's level until something sets it. 1, not 0: architectural
 * lighting is "not tied to game state" (the PRD's definition), and nothing
 * in this tree emits a `GiCommand`, so the lamps are simply on.
 */
export const ARCHITECTURAL_DEFAULT_LEVEL = 1;

/** One scene's architectural lamps: the lights (created once, never replaced) and each channel's current level. */
interface ArchitecturalLamps {
	readonly lights: ReadonlyMap<GiChannel, PointLight>;
	readonly levels: Map<GiChannel, number>;
}

const lampsByScene = new WeakMap<Scene, ArchitecturalLamps>();

function channels(): GiChannel[] {
	return Object.keys(TABLE.giChannels) as GiChannel[];
}

function isChannel(value: unknown): value is GiChannel {
	return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TABLE.giChannels, value);
}

function isLevel(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** A value as it should read in a message: a string quoted, anything else as `String()` gives it (`NaN`, `Infinity`, `null`, `undefined`). */
function shown(value: unknown): string {
	return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function unknownChannelProblem(channel: unknown): string {
	return `unknown architectural channel ${shown(channel)} (the channels are ${channels().join(', ')})`;
}

function badLevelProblem(channel: GiChannel, level: unknown): string {
	return `channel ${channel}: level ${shown(level)} is not a finite number in [0, 1]`;
}

/**
 * Why `(channel, level)` cannot be applied, as a sentence naming the
 * offending value, or `null` when it can. Pure: no scene, no side effect.
 * `level` may be a number in [0, 1], or `null` for the default level (the
 * dev hatch's "restore"). An unknown channel is reported before a bad level.
 */
export function architecturalLevelProblem(channel: unknown, level: unknown): string | null {
	if (!isChannel(channel)) {
		return unknownChannelProblem(channel);
	}
	if (level !== null && !isLevel(level)) {
		return badLevelProblem(channel, level);
	}
	return null;
}

function resolveTargets(scene: Scene, channel: GiChannel): AbstractMesh[] {
	return ARCHITECTURAL_LAMPS[channel].targets.map((name) => {
		const node = getRequiredNode(scene, name);
		if (!(node instanceof AbstractMesh)) {
			throw new Error(`architectural.ts: "${name}", a target of channel ${channel}, carries no mesh to light`);
		}
		return node;
	});
}

function lampsFor(scene: Scene): ArchitecturalLamps {
	const cached = lampsByScene.get(scene);
	if (cached) {
		return cached;
	}
	// Resolve and validate EVERYTHING before the first light exists: a scene
	// missing a lamp Empty or a target must throw on every call and leave no
	// orphan light behind.
	const resolved = channels().map((channel) => ({
		channel,
		lamp: ARCHITECTURAL_LAMPS[channel],
		// The lamp's position: the Empty of the channel's own name (AD-11).
		position: getRequiredNode(scene, channel),
		targets: resolveTargets(scene, channel),
	}));

	const lights = new Map<GiChannel, PointLight>();
	const levels = new Map<GiChannel, number>();
	for (const { channel, lamp, position, targets } of resolved) {
		const light = new PointLight(`light_${channel}`, Vector3.Zero(), scene);
		light.parent = position;
		light.includedOnlyMeshes = targets;
		light.falloffType = PointLight.FALLOFF_STANDARD;
		light.range = lamp.rangeM;
		light.diffuse = new Color3(lamp.color[0], lamp.color[1], lamp.color[2]);
		light.intensity = ARCHITECTURAL_DEFAULT_LEVEL * lamp.intensity;
		lights.set(channel, light);
		levels.set(channel, ARCHITECTURAL_DEFAULT_LEVEL);
	}
	const lamps: ArchitecturalLamps = { lights, levels };
	lampsByScene.set(scene, lamps);
	return lamps;
}

/**
 * Creates (once per scene) one scoped `PointLight` per `TABLE.giChannels`
 * key, parented to the Empty of the same name at local position zero, at
 * the default level, and returns them keyed by channel. Throws naming the
 * node when a lamp Empty or a target mesh is missing. Idempotent: every
 * later call returns the same map of the same lights and creates nothing.
 * Exported so the host can resolve eagerly on its first render frame (a
 * missing Empty then reaches the error panel, AD-17).
 */
export function resolveArchitecturalLamps(scene: Scene): ReadonlyMap<GiChannel, PointLight> {
	return lampsFor(scene).lights;
}

/**
 * Sets `channel`'s level: its light's intensity becomes `level` times the
 * authored intensity. Writes `intensity` only -- the light stays enabled at
 * level 0, and no other light is touched. Throws a `RangeError` naming the
 * channel and the value, and changes nothing, when `level` is not a finite
 * number in [0, 1]; throws naming the channel when it is not one of
 * `TABLE.giChannels`' keys.
 */
export function setArchitecturalLevel(scene: Scene, channel: GiChannel, level: number): void {
	if (!isChannel(channel)) {
		throw new Error(`architectural.ts: setArchitecturalLevel(): ${unknownChannelProblem(channel)}`);
	}
	if (!isLevel(level)) {
		throw new RangeError(`architectural.ts: setArchitecturalLevel(): ${badLevelProblem(channel, level)}`);
	}
	const lamps = lampsFor(scene);
	lamps.levels.set(channel, level);
	lamps.lights.get(channel)!.intensity = level * ARCHITECTURAL_LAMPS[channel].intensity;
}

/** `channel`'s current level in `scene` (the default until it is set). */
export function architecturalLevel(scene: Scene, channel: GiChannel): number {
	if (!isChannel(channel)) {
		throw new Error(`architectural.ts: architecturalLevel(): ${unknownChannelProblem(channel)}`);
	}
	return lampsFor(scene).levels.get(channel)!;
}
