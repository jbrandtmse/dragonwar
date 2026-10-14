// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 5.3 AC 7 -- the architectural lamps
// (`src/presentation/lighting/architectural.ts`), on the REAL shipped scene
// path (`loadAndRenderOnceForTests()` on a `NullEngine`, the committed glb):
// one scoped `PointLight` per `TABLE.giChannels` key, created once at the
// Empty of the same name, driven by intensity through
// `setArchitecturalLevel(scene, channel, level)`, and never created,
// disposed or toggled afterwards. Plus the level rows of the I/O matrix.
//
// The authored values are typed ONCE below (`TYPED_LAMPS`), from the spec's
// Boundaries -- never read from `ARCHITECTURAL_LAMPS`, which is the thing
// under test. They are starting values the lead measures in a browser; a
// retune is an edit to that table and to this one, nowhere else.
//
// What this file cannot prove: that a lamp changes a pixel. `NullEngine`
// rasterises nothing. What it can prove is everything a pixel depends on
// that is not shading: the light exists, sits where Blender put it, on the
// lit side of what it lights (N.L > 0), is in the light list of exactly its
// targets and of nothing else, and scales with the level.
//
// A trap this file avoids (`lamp-driver.ts`'s own header): under
// `NullEngine`, `ShadowLight.getAbsolutePosition()` returns the stale local
// `position`; a light's world position is read here through
// `computeWorldMatrix(true).getTranslation()` only.
//
// Falsifiability (Rule 19; each observed red, recorded in the spec's
// Verification section):
//   mutation: delete the includedOnlyMeshes assignment in architectural.ts
//     -> the light-list case red.
//   mutation: set intensity to the authored value regardless of level -> the
//     level case red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import type { Light } from '@babylonjs/core/Lights/light';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0/glTFLoader';
import { loadAndRenderOnceForTests } from '../src/presentation/scene/create-engine';
import { getRequiredNode, type PlayfieldNodes } from '../src/presentation/scene/playfield';
import { resolveCabinet } from '../src/presentation/scene/cabinet';
import {
	ARCHITECTURAL_DEFAULT_LEVEL,
	ARCHITECTURAL_LAMPS,
	architecturalLevel,
	architecturalLevelProblem,
	resolveArchitecturalLamps,
	setArchitecturalLevel,
} from '../src/presentation/lighting/architectural';
import { glbToTable, type Vec3 } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import { TUNING } from '../src/sim/table/tuning';
import type { GiChannel } from '../src/sim/table/names';

const GLB_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.glb');

/**
 * The spec's authored lamps, typed here once. Targets, the shared warm
 * diffuse colour, the intensity at level 1 and the standard falloff's range
 * in metres.
 */
const TYPED_LAMPS: Readonly<Record<string, { targets: string[]; color: [number, number, number]; intensity: number; rangeM: number }>> = {
	gi_backbox: { targets: ['vis_head_lightbox'], color: [1.0, 0.85, 0.6], intensity: 20, rangeM: 2.0 },
	gi_cabinet: { targets: ['vis_cabinet', 'vis_cabinet_rail_l', 'vis_cabinet_rail_r', 'vis_lockbar'], color: [1.0, 0.85, 0.6], intensity: 20, rangeM: 3.0 },
	gi_arch: { targets: ['vis_cabinet_arch'], color: [1.0, 0.85, 0.6], intensity: 10, rangeM: 2.0 },
};
const TYPED_DEFAULT_LEVEL = 1;
const CHANNELS = Object.keys(TABLE.giChannels) as GiChannel[];
/** Meshes no architectural light may reach (AC 7), besides every `l_` insert. */
const NEVER_LIT = ['vis_playfield', 'vis_backbox', 'vis_top_glass', 'vis_head_translite'];
const CABINET_ROOT = TABLE.nodes.cabinetRoot;
/** `Light.FALLOFF_STANDARD` (Babylon 9's own value; 0 default, 1 physical, 2 glTF, 3 standard), typed so a changed assignment is caught rather than mirrored. */
const FALLOFF_STANDARD = 3;

function glbDataUrl(bytes: Buffer): string {
	return `data:;base64,${bytes.toString('base64')}`; // test-only, see test/scene-smoke.test.ts's own header
}

async function withShippedScene(body: (scene: Scene, nodes: PlayfieldNodes) => void | Promise<void>): Promise<void> {
	const engine = new NullEngine();
	try {
		const { scene, playfieldNodes } = await loadAndRenderOnceForTests(engine, glbDataUrl(readFileSync(GLB_PATH)), { pluginExtension: '.glb' });
		try {
			await body(scene, playfieldNodes);
		} finally {
			scene.dispose();
		}
	} finally {
		engine.dispose();
	}
}

function meshNamed(scene: Scene, name: string): AbstractMesh {
	const node = getRequiredNode(scene, name);
	if (!(node instanceof AbstractMesh)) {
		throw new Error(`"${name}" carries no mesh`);
	}
	return node;
}

/** A mesh's own vertices in world space, in level-frame millimetres. */
function levelVertices(mesh: AbstractMesh): Vec3[] {
	const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
	const world = mesh.computeWorldMatrix(true);
	const out: Vec3[] = [];
	for (let i = 0; i < positions.length; i += 3) {
		const p = Vector3.TransformCoordinates(new Vector3(positions[i]!, positions[i + 1]!, positions[i + 2]!), world);
		out.push(glbToTable({ x: p.x, y: p.y, z: p.z }));
	}
	return out;
}

function levelPosition(world: Vector3): Vec3 {
	return glbToTable({ x: world.x, y: world.y, z: world.z });
}

function architecturalLights(scene: Scene): Light[] {
	return [...resolveArchitecturalLamps(scene).values()];
}

describe('Story 5.3 AC 7 -- the authored table', () => {
	it('ARCHITECTURAL_LAMPS holds exactly the spec\'s targets, colour, intensities and ranges, keyed by TABLE.giChannels\' own keys', () => {
		expect(Object.keys(ARCHITECTURAL_LAMPS), 'the same channels, in TABLE\'s order').toEqual(Object.keys(TABLE.giChannels));
		expect(Object.keys(TYPED_LAMPS).sort(), 'non-vacuity: the typed copy covers every channel').toEqual(Object.keys(TABLE.giChannels).sort());
		expect(ARCHITECTURAL_LAMPS).toEqual(TYPED_LAMPS);
		expect(ARCHITECTURAL_DEFAULT_LEVEL).toBe(TYPED_DEFAULT_LEVEL);
	});

	it('the worst-case light count stays inside the live budget: every insert light, the three architectural lights and the hemispheric light', () => {
		const worstCase = Object.keys(TABLE.lamps).length + CHANNELS.length + 1;
		expect(CHANNELS.length, 'three architectural channels').toBe(3);
		expect(worstCase, `worst case ${worstCase} lights`).toBeLessThanOrEqual(TUNING.liveLightBudget.value);
	});
});

describe('Story 5.3 AC 7 -- resolveArchitecturalLamps() on the shipped scene (NullEngine + committed glb)', () => {
	it('adds exactly one light per channel, named light_<channel>; a second resolve and a level change add none and keep the same light objects', async () => {
		await withShippedScene((scene) => {
			const before = scene.lights.length;
			const lamps = resolveArchitecturalLamps(scene);
			expect(scene.lights.length - before, 'lights added by the first resolve').toBe(CHANNELS.length);
			expect([...lamps.keys()]).toEqual(CHANNELS);
			const lights = CHANNELS.map((channel) => lamps.get(channel)!);
			for (const [i, channel] of CHANNELS.entries()) {
				expect(lights[i], `${channel}: a PointLight`).toBeInstanceOf(PointLight);
				expect(lights[i]!.name).toBe(`light_${channel}`);
				expect(scene.lights.filter((l) => l.name === `light_${channel}`).length, `${channel}: created once`).toBe(1);
			}
			expect(new Set(lights).size, 'three distinct lights').toBe(CHANNELS.length);

			const again = resolveArchitecturalLamps(scene);
			expect(again, 'the same map').toBe(lamps);
			expect(CHANNELS.map((channel) => again.get(channel)), 'the same light objects').toEqual(lights);
			setArchitecturalLevel(scene, CHANNELS[0]!, 0.5);
			setArchitecturalLevel(scene, CHANNELS[0]!, 0);
			expect(architecturalLights(scene), 'still the same light objects after level changes').toEqual(lights);
			expect(scene.lights.length - before, 'no light created by a second resolve or a level change').toBe(CHANNELS.length);
			expect(lights.every((l) => !l.isDisposed()), 'none disposed').toBe(true);
		});
	});

	it('each light sits at its Empty (world position equal, parented at local zero), with the authored colour, bounded standard falloff and range', async () => {
		await withShippedScene((scene, nodes) => {
			const lamps = resolveArchitecturalLamps(scene);
			for (const channel of CHANNELS) {
				const typed = TYPED_LAMPS[channel]!;
				const light = lamps.get(channel)!;
				const empty = getRequiredNode(scene, channel);
				expect(empty, `${channel}: the lamp's position is a mesh-less node`).not.toBeInstanceOf(AbstractMesh);
				expect(empty.parent, `${channel}: the Empty is a direct child of ${CABINET_ROOT}`).toBe(nodes.cabinetRoot);
				expect(light.parent, `${channel}: the light is parented to its Empty`).toBe(empty);
				expect(light.position.asArray(), `${channel}: at local position zero`).toEqual([0, 0, 0]);
				const lightWorld = light.computeWorldMatrix(true).getTranslation();
				const emptyWorld = empty.computeWorldMatrix(true).getTranslation();
				expect(Vector3.Distance(lightWorld, emptyWorld), `${channel}: light ${lightWorld.toString()} vs Empty ${emptyWorld.toString()}`).toBeLessThan(1e-9);
				expect(emptyWorld.length(), `${channel}: non-vacuity -- the Empty is not at the origin`).toBeGreaterThan(0.2);

				expect(light.falloffType, `${channel}: bounded standard falloff`).toBe(FALLOFF_STANDARD);
				expect(PointLight.FALLOFF_STANDARD, 'the typed constant is Babylon\'s own').toBe(FALLOFF_STANDARD);
				expect(light.range, `${channel}: range (m)`).toBe(typed.rangeM);
				expect(light.diffuse.asArray(), `${channel}: diffuse`).toEqual(typed.color);
				expect(light.isEnabled(), `${channel}: enabled`).toBe(true);
			}
		});
	});

	// mutation: delete the includedOnlyMeshes assignment in architectural.ts -> red here.
	it('each light is in the light list of exactly its authored targets, each a real mesh under cabinet_root, and of nothing else', async () => {
		await withShippedScene((scene, nodes) => {
			const lamps = resolveArchitecturalLamps(scene);
			const architectural = new Set<Light>(lamps.values());
			const expectedByMesh = new Map<AbstractMesh, Light[]>();
			for (const channel of CHANNELS) {
				const light = lamps.get(channel)!;
				const targets = TYPED_LAMPS[channel]!.targets.map((name) => meshNamed(scene, name));
				expect(light.includedOnlyMeshes.length, `${channel}: scoped to its ${targets.length} target(s)`).toBe(targets.length);
				expect([...light.includedOnlyMeshes].map((m) => m.name).sort(), `${channel}: includedOnlyMeshes`).toEqual(targets.map((m) => m.name).sort());
				for (const target of targets) {
					expect(light.includedOnlyMeshes, `${channel}: the very mesh ${target.name}`).toContain(target);
					expect(target.getTotalVertices(), `${target.name}: a real mesh`).toBeGreaterThan(0);
					expect(target.isDescendantOf(nodes.cabinetRoot), `${target.name}: under ${CABINET_ROOT}`).toBe(true);
					expect(target.lightSources, `${target.name}: lit by ${channel}`).toContain(light);
					expectedByMesh.set(target, [...(expectedByMesh.get(target) ?? []), light]);
				}
			}
			// Every mesh of the scene: its architectural lights are exactly the
			// ones whose target it is -- none for the playfield, the inserts, the
			// Backglass, the glass or the translite.
			let scanned = 0;
			for (const mesh of scene.meshes) {
				scanned += 1;
				const here = mesh.lightSources.filter((l) => architectural.has(l));
				expect(here.map((l) => l.name).sort(), `${mesh.name}: architectural lights in its light list`).toEqual((expectedByMesh.get(mesh) ?? []).map((l) => l.name).sort());
			}
			expect(scanned, 'non-vacuity: meshes scanned').toBeGreaterThan(150);
			const neverLit = [...NEVER_LIT.map((name) => meshNamed(scene, name)), ...scene.meshes.filter((m) => m.name.startsWith('l_'))];
			expect(neverLit.length, 'non-vacuity: the four named meshes and the inserts').toBe(NEVER_LIT.length + Object.keys(TABLE.lamps).length);
			for (const mesh of neverLit) {
				expect(mesh.lightSources.filter((l) => architectural.has(l)), `${mesh.name}: no architectural light`).toEqual([]);
			}
			// The positive half of that negative: those meshes DO have a light
			// list (the hemispheric light), so an empty filter is not an empty list.
			expect(meshNamed(scene, 'vis_playfield').lightSources.length, 'vis_playfield is lit by the hemispheric light').toBeGreaterThan(0);
		});
	});

	it('no cabinet mesh has more enabled light sources than its material takes', async () => {
		await withShippedScene((scene, nodes) => {
			resolveArchitecturalLamps(scene);
			const cabinet = resolveCabinet(scene, nodes.cabinetRoot);
			expect(cabinet.meshes.size, 'non-vacuity: the eleven cabinet meshes').toBe(11);
			let lit = 0;
			for (const mesh of cabinet.meshes.values()) {
				const material = mesh.material as PBRMaterial;
				const enabled = mesh.lightSources.filter((l) => l.isEnabled()).length;
				expect(enabled, `${mesh.name}: ${enabled} enabled lights, material takes ${material.maxSimultaneousLights}`).toBeLessThanOrEqual(material.maxSimultaneousLights);
				if (enabled > 1) {
					lit += 1;
				}
			}
			expect(lit, 'non-vacuity: the six targets carry a second light').toBe(Object.values(TYPED_LAMPS).reduce((n, lamp) => n + lamp.targets.length, 0));
		});
	});

	it('each lamp stands on the lit side of what it lights: N.L > 0 on the lightbox panel\'s front face, the arch panel\'s front face and the body\'s front face', async () => {
		await withShippedScene((scene) => {
			resolveArchitecturalLamps(scene);
			const at = (channel: string): Vec3 => levelPosition(getRequiredNode(scene, channel).computeWorldMatrix(true).getTranslation());
			const frontY = (name: string): number => Math.min(...levelVertices(meshNamed(scene, name)).map((v) => v.y));
			const backY = (name: string): number => Math.max(...levelVertices(meshNamed(scene, name)).map((v) => v.y));
			const box = (name: string): { min: Vec3; max: Vec3 } => {
				const v = levelVertices(meshNamed(scene, name));
				return {
					min: { x: Math.min(...v.map((p) => p.x)), y: Math.min(...v.map((p) => p.y)), z: Math.min(...v.map((p) => p.z)) },
					max: { x: Math.max(...v.map((p) => p.x)), y: Math.max(...v.map((p) => p.y)), z: Math.max(...v.map((p) => p.z)) },
				};
			};

			// The backbox lamp: in front of the lightbox panel's front face
			// (normal -y), behind the translite, inside the backbox.
			const backbox = at('gi_backbox');
			expect(frontY('vis_head_lightbox') - backbox.y, 'gi_backbox is in front of the lightbox panel\'s front face').toBeGreaterThan(0);
			expect(backbox.y - backY('vis_head_translite'), 'gi_backbox is behind the translite').toBeGreaterThan(0);
			const head = box('vis_head');
			expect(backbox.x > head.min.x && backbox.x < head.max.x && backbox.z > head.min.z && backbox.z < head.max.z, 'gi_backbox is inside the backbox\'s outline').toBe(true);

			// The arch lamp: in front of the arch panel's front face (normal -y).
			const arch = at('gi_arch');
			expect(frontY('vis_cabinet_arch') - arch.y, 'gi_arch is in front of the arch panel\'s front face').toBeGreaterThan(0);

			// The cabinet lamp: in front of the body's front face (normal -y) and
			// above the rails' and the lockdown bar's top faces (normal +z).
			const cabinet = at('gi_cabinet');
			expect(frontY('vis_cabinet') - cabinet.y, 'gi_cabinet is in front of the body\'s front face').toBeGreaterThan(0);
			for (const name of ['vis_cabinet_rail_l', 'vis_cabinet_rail_r', 'vis_lockbar']) {
				expect(cabinet.z - box(name).max.z, `gi_cabinet is above ${name}`).toBeGreaterThan(0);
			}
		});
	});
});

describe('Story 5.3 AC 7 -- setArchitecturalLevel() (I/O matrix rows)', () => {
	// mutation: set intensity to the authored value regardless of level -> red here.
	it('Level set: at the default every level is 1 and each intensity its authored value; 0.25 on one channel quarters that light alone', async () => {
		await withShippedScene((scene) => {
			const lamps = resolveArchitecturalLamps(scene);
			const intensities = (): number[] => CHANNELS.map((channel) => lamps.get(channel)!.intensity);
			expect(CHANNELS.map((channel) => architecturalLevel(scene, channel)), 'default levels').toEqual([1, 1, 1]);
			expect(intensities(), 'default intensities').toEqual(CHANNELS.map((channel) => TYPED_LAMPS[channel]!.intensity));

			for (const [i, channel] of CHANNELS.entries()) {
				const lightsBefore = scene.lights.length;
				const before = intensities();
				setArchitecturalLevel(scene, channel, 0.25);
				const after = intensities();
				expect(after[i], `${channel}: a quarter of its authored intensity`).toBeCloseTo(TYPED_LAMPS[channel]!.intensity * 0.25, 10);
				expect(after[i], `${channel}: non-vacuity -- the intensity moved`).not.toBe(before[i]);
				expect(after.filter((_, k) => k !== i), `${channel}: the other two lights are untouched`).toEqual(before.filter((_, k) => k !== i));
				expect(architecturalLevel(scene, channel)).toBe(0.25);
				expect(scene.lights.length, `${channel}: scene.lights.length unchanged`).toBe(lightsBefore);
				setArchitecturalLevel(scene, channel, 1);
				expect(intensities(), `${channel}: level 1 restores the authored intensity`).toEqual(CHANNELS.map((c) => TYPED_LAMPS[c]!.intensity));
			}
		});
	});

	it('Level 0: the light goes to intensity 0 and stays enabled, in the scene and in its targets\' light lists', async () => {
		await withShippedScene((scene) => {
			const lamps = resolveArchitecturalLamps(scene);
			const lists = (): number[] => CHANNELS.map((channel) => meshNamed(scene, TYPED_LAMPS[channel]!.targets[0]!).lightSources.length);
			const before = lists();
			for (const channel of CHANNELS) {
				setArchitecturalLevel(scene, channel, 0);
				const light = lamps.get(channel)!;
				expect(light.intensity, `${channel}: intensity 0`).toBe(0);
				expect(light.isEnabled(), `${channel}: still enabled at level 0`).toBe(true);
				expect(scene.lights, `${channel}: still in the scene`).toContain(light);
				expect(architecturalLevel(scene, channel)).toBe(0);
			}
			expect(lists(), 'no mesh\'s light list changed').toEqual(before);
		});
	});

	it('Level out of range or not finite: -0.1, 1.5, NaN and Infinity each throw a RangeError naming the channel and the value, and change nothing', async () => {
		await withShippedScene((scene) => {
			const lamps = resolveArchitecturalLamps(scene);
			const channel = CHANNELS[1]!;
			setArchitecturalLevel(scene, channel, 0.5);
			const snapshot = (): string => JSON.stringify(CHANNELS.map((c) => [architecturalLevel(scene, c), lamps.get(c)!.intensity, lamps.get(c)!.isEnabled()]));
			const before = snapshot();
			for (const [bad, shown] of [[-0.1, '-0.1'], [1.5, '1.5'], [Number.NaN, 'NaN'], [Number.POSITIVE_INFINITY, 'Infinity'], [Number.NEGATIVE_INFINITY, '-Infinity']] as const) {
				let thrown: unknown;
				try {
					setArchitecturalLevel(scene, channel, bad);
				} catch (err) {
					thrown = err;
				}
				expect(thrown, `level ${shown}: throws`).toBeInstanceOf(RangeError);
				expect((thrown as Error).message, `level ${shown}: names the channel`).toContain(channel);
				expect((thrown as Error).message, `level ${shown}: names the value`).toContain(`level ${shown} `);
				expect(snapshot(), `level ${shown}: nothing changed`).toBe(before);
			}
			// The positive control: the bounds themselves are accepted.
			expect(() => setArchitecturalLevel(scene, channel, 0)).not.toThrow();
			expect(() => setArchitecturalLevel(scene, channel, 1)).not.toThrow();
			// An unknown channel is refused too, naming it.
			expect(() => setArchitecturalLevel(scene, 'gi_nope' as GiChannel, 1)).toThrow(/gi_nope/);
			expect(() => architecturalLevel(scene, 'gi_nope' as GiChannel)).toThrow(/gi_nope/);
		});
	});

	it('Scene rebuilt: a second scene gets its own three lights at the default level, whatever the first was set to', async () => {
		await withShippedScene(async (sceneA) => {
			const a = resolveArchitecturalLamps(sceneA);
			setArchitecturalLevel(sceneA, CHANNELS[0]!, 0);
			await withShippedScene((sceneB) => {
				const lightsBefore = sceneB.lights.length;
				const b = resolveArchitecturalLamps(sceneB);
				expect(sceneB.lights.length - lightsBefore, 'the second scene\'s own three lights').toBe(CHANNELS.length);
				for (const channel of CHANNELS) {
					expect(b.get(channel), `${channel}: a different light object`).not.toBe(a.get(channel));
					expect(b.get(channel)!.getScene()).toBe(sceneB);
					expect(architecturalLevel(sceneB, channel), `${channel}: the default level`).toBe(TYPED_DEFAULT_LEVEL);
					expect(b.get(channel)!.intensity).toBe(TYPED_LAMPS[channel]!.intensity);
				}
				expect(architecturalLevel(sceneA, CHANNELS[0]!), 'the first scene keeps its own level').toBe(0);
			});
		});
	});

	it('Lamp Empty missing, or a target missing: the resolve throws naming the node, creates no light, and resolves once the node is back', async () => {
		await withShippedScene((scene) => {
			const lightsBefore = scene.lights.length;
			for (const name of [CHANNELS[2]!, TYPED_LAMPS[CHANNELS[0]!]!.targets[0]!]) {
				const node = getRequiredNode(scene, name);
				node.name = `${name}_gone`;
				expect(() => resolveArchitecturalLamps(scene)).toThrow(new RegExp(`"${name}"`));
				expect(() => setArchitecturalLevel(scene, CHANNELS[0]!, 0.5), 'the setter resolves first, so it throws the same way').toThrow(new RegExp(`"${name}"`));
				expect(scene.lights.length, `${name} missing: no orphan light`).toBe(lightsBefore);
				node.name = name;
			}
			expect(resolveArchitecturalLamps(scene).size, 'the positive control: the restored scene resolves').toBe(CHANNELS.length);
			expect(scene.lights.length - lightsBefore).toBe(CHANNELS.length);
		});
	});
});

describe('Story 5.3 -- architecturalLevelProblem() (the pure rule the dev hatch validates with)', () => {
	it('a known channel with a level in [0, 1], or null for the default, has no problem', () => {
		for (const channel of CHANNELS) {
			for (const level of [0, 0.25, 1, null]) {
				expect(architecturalLevelProblem(channel, level), `${channel}, ${String(level)}`).toBeNull();
			}
		}
	});

	it('Unknown channel: the problem names the value and lists the channels; it is reported before a bad level', () => {
		const problem = architecturalLevelProblem('gi_nope', 1);
		expect(problem).toContain('"gi_nope"');
		for (const channel of CHANNELS) {
			expect(problem, `lists ${channel}`).toContain(channel);
		}
		expect(architecturalLevelProblem('gi_nope', 7)).toContain('"gi_nope"');
		for (const notAChannel of [undefined, null, 3, {}, 'toString', 'constructor', '']) {
			expect(architecturalLevelProblem(notAChannel, 1), `${String(notAChannel)} is not a channel`).toMatch(/unknown architectural channel/);
		}
	});

	it('Level out of range or not finite: the problem names the channel and the value', () => {
		const channel = CHANNELS[0]!;
		for (const [bad, shown] of [[-0.1, '-0.1'], [1.5, '1.5'], [Number.NaN, 'NaN'], [Number.POSITIVE_INFINITY, 'Infinity'], ['1', '"1"'], [undefined, 'undefined'], [true, 'true']] as const) {
			const problem = architecturalLevelProblem(channel, bad);
			expect(problem, `level ${shown}`).not.toBeNull();
			expect(problem, `level ${shown}: names the channel`).toContain(channel);
			expect(problem, `level ${shown}: names the value`).toContain(`level ${shown} `);
		}
	});
});
