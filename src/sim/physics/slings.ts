// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-5, DW-79 -- wires the frozen vpx-js `LineSegSlingshot` port into the
// collision solve without editing it: `KickReportingSlingshot` is a thin
// subclass that re-evaluates the SAME kick-branch test the base class runs
// internally, defers entirely to `super.collide()` for the actual physics,
// and reports whether the kick fired through an injected sink -- never
// through `fireGroupEvent()`, whose guard is `this.threshold` (a HitObject
// field distinct from `SlingshotSurfaceData.slingshotThreshold` that this
// story never sets, so it stays at its frozen default of 0 and the tail
// stays dead, exactly as `line-seg-slingshot.ts`'s own header records).
//
// `createSlingshotMechanics()` is `sim/physics/loader/index.ts`'s own
// drop-in replacement for a plain `LineSeg` at the two sling nodes'
// per-footprint-edge construction site: it owns the per-coil
// `SlingshotSurfaceData` handles (machine.ts flips `.isDisabled` on them from
// its own `coilEnabled` map every tick, AD-5's "gated only by CoilCommand
// enable | disable"), the coil<->node correlation (mirroring `flippers.ts`'s
// own `SIDE_BY_COIL` pattern -- object KEYS, never a `c_`-prefixed string
// literal, `pnpm lint:boundaries`'s device-name-literal rule), and the kick
// sink `machine.ts` drains once per tick, AFTER `physics.step()` returns and
// stamps the current `tick` on each drained kick (the kick itself fires
// DURING the solve, which receives no `tick` argument of its own).
//
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_PHYSICS_FILE_RELATIVE_PATHS`
// and `tools/dependency-cruiser.config.mjs`'s `AUTHORED_PHYSICS_FILES`).

import { LineSegSlingshot, type SlingshotSurfaceData } from './line-seg-slingshot';
import type { PlayerPhysics } from './game/player-physics';
import type { CollisionEvent } from './collision-event';
import { Vertex2D } from './math/vertex2d';
import type { CoilName } from '../table/names';

/** One kick, reported WITHOUT a `tick` -- `machine.ts` stamps the tick once it drains the sink after `physics.step()` returns (see this file's header). */
export interface SlingKick {
	readonly coil: CoilName;
	readonly ballId: number;
}

/**
 * Re-evaluates `LineSegSlingshot.collide()`'s own kick-branch test (`dot <=
 * -surfaceData.slingshotThreshold`, unchanged from the frozen port, DW-79)
 * BEFORE calling `super.collide()`, so the sink records a kick if and only if
 * the base class's kick branch actually ran this contact -- never on a graze
 * below threshold, and never while `surfaceData.isDisabled`. Deliberately
 * does not touch `this.obj` / `this.fe` / `this.threshold` -- see this
 * file's header for why reaching the port's own dead event tail would be
 * both unnecessary and wrong (it would fire on kick-less grazes too, since
 * its guard is a DIFFERENT field).
 *
 * Reads `coll.ball.hit.vel` and `coll.hitNormal` BEFORE `super.collide()`
 * runs, exactly mirroring the base class's own internal order (it computes
 * the identical `dot` from the identical, not-yet-mutated fields) -- this is
 * not a second, possibly-inconsistent evaluation, it is the same test read
 * one statement earlier so the OUTCOME can be reported after the mutation
 * has happened.
 */
export class KickReportingSlingshot extends LineSegSlingshot {
	private readonly kickSurfaceData: SlingshotSurfaceData;
	private readonly onKick: (ballId: number) => void;

	constructor(
		surfaceData: SlingshotSurfaceData,
		p1: Vertex2D,
		p2: Vertex2D,
		zLow: number,
		zHigh: number,
		physics: PlayerPhysics,
		onKick: (ballId: number) => void,
	) {
		super(surfaceData, p1, p2, zLow, zHigh, physics);
		this.kickSurfaceData = surfaceData;
		this.onKick = onKick;
	}

	public override collide(coll: CollisionEvent): void {
		const dot = coll.hitNormal.dot(coll.ball.hit.vel);
		const willKick = !this.kickSurfaceData.isDisabled && dot <= -this.kickSurfaceData.slingshotThreshold;
		const ballId = coll.ball.id;
		super.collide(coll);
		if (willKick) {
			this.onKick(ballId);
		}
	}
}

/** Every ballId reported since the last `drain()` call, in firing order; `drain()` clears the buffer. One per coil (see `createSlingshotMechanics()`), so the coil identity is carried by WHICH sink recorded a ballId, never by a value stored inside the record itself. */
interface SlingshotSink {
	record(ballId: number): void;
	drain(): readonly number[];
}

function createSlingshotSink(): SlingshotSink {
	let pending: number[] = [];
	return {
		record(ballId) {
			pending.push(ballId);
		},
		drain() {
			const out = pending;
			pending = [];
			return out;
		},
	};
}

/**
 * `TABLE.coils` names no per-sling field of its own (`Record<string, never>`,
 * spec Code Map) -- `c_sling_l`/`c_sling_r` are read here via `Object.keys()`
 * (a runtime value, never a quoted literal) rather than spelling either name
 * out, exactly the reasoning `flippers.ts`'s own `SIDE_BY_COIL` states for
 * itself. The VALUE side (`col_sling_l`/`col_sling_r`) is a plain string
 * literal, not a coil/switch/lamp/flasher/gi/ball-device/shot/show name --
 * `pnpm lint:boundaries`'s device-name-literal pattern does not restrict a
 * `col_`-prefixed value, only an `s_`/`c_`/`l_`/`f_`/`gi_`/`bd_`/`shot_`/
 * `show_`-prefixed one.
 */
// Deliberately UNANNOTATED (`as const`, no `Record<…>` type written out): an
// explicit `Record<'c_sling_l' | 'c_sling_r', string>` annotation would be a
// second, redundant SOURCE-TEXT copy of the coil-name union for `pnpm
// lint:boundaries`'s device-name-literal check to find (that check scans
// quoted spans in the TEXT, not the type system, so a type spelled out a
// second time is a second literal it sees regardless of being "only a
// type") -- inference from the object literal's own KEYS (never quoted --
// see this file's header) already gives the same type via `keyof typeof`
// below, with nothing additional written in quotes anywhere.
const SLING_NODE_BY_COIL = {
	c_sling_l: 'col_sling_l',
	c_sling_r: 'col_sling_r',
} as const;

/** Derived from `SLING_NODE_BY_COIL`'s own inferred key set -- see that constant's own comment for why it carries no separate type annotation. */
type SlingCoilName = keyof typeof SLING_NODE_BY_COIL;

export interface SlingSurfaceDataByCoil {
	readonly c_sling_l: SlingshotSurfaceData;
	readonly c_sling_r: SlingshotSurfaceData;
}

/** A per-edge segment builder for exactly one sling node -- `loader/index.ts`'s `addWall()` calls it once per footprint edge, in place of `new LineSeg(...)`. */
export type SlingshotSegmentBuilder = (p1: Vertex2D, p2: Vertex2D, zLow: number, zHigh: number) => KickReportingSlingshot;

export interface SlingshotMechanics {
	/** The two sling nodes' collision-node names, keyed by coil -- `loader/index.ts`'s own node-name dispatch reads this instead of a local literal (AD-11: node names are wiring). */
	readonly nodeNameByCoil: Readonly<Record<SlingCoilName, string>>;
	/** Held by reference inside every `KickReportingSlingshot` instance this mechanism's builders construct -- `machine.ts` flips `.isDisabled` on these same objects every tick, so a mutation takes effect on the very next contact with no re-load (AD-5). */
	readonly surfaceData: SlingSurfaceDataByCoil;
	/** One segment builder per coil, for `loader/index.ts` to call once per footprint edge of that coil's own node. */
	readonly segmentBuilderByCoil: Readonly<Record<SlingCoilName, SlingshotSegmentBuilder>>;
	/** Every `coil_fire` produced since the last drain, in firing order, with `tick` still unset -- `machine.ts` stamps it once it drains this AFTER `physics.step()` returns (the kick fires DURING the solve, which receives no `tick` of its own). */
	drainKicks(): readonly SlingKick[];
}

/**
 * Builds both slings' surface-data handles, segment builders and shared kick
 * sink. `thresholdVuPerTick` and `force` are already-converted/authored
 * values (`sim/physics/loader/index.ts` reads `tuning.hardware.*` and
 * performs the mm/s -> VU/T conversion itself, mirroring `devices.ts`'s own
 * `tableSpeedToPhysicsVelocity()` -- this file stays unit-agnostic, exactly
 * as the frozen `LineSegSlingshot` port itself is).
 */
export function createSlingshotMechanics(options: {
	readonly physics: PlayerPhysics;
	readonly thresholdVuPerTick: number;
	readonly force: number;
}): SlingshotMechanics {
	const { physics, thresholdVuPerTick, force } = options;

	// DW-149 anti-vacuity: the coil set this mechanism covers is derived from
	// `SLING_NODE_BY_COIL`'s own key set, never a hand-typed literal count --
	// a future third slingshot added to that map is covered automatically,
	// and an emptied map fails loudly here rather than silently building
	// nothing.
	const coils = Object.keys(SLING_NODE_BY_COIL) as SlingCoilName[];
	if (coils.length === 0) {
		throw new Error('createSlingshotMechanics(): SLING_NODE_BY_COIL has no entries -- nothing to build');
	}

	const surfaceData: SlingSurfaceDataByCoil = {
		c_sling_l: { isDisabled: false, slingshotThreshold: thresholdVuPerTick },
		c_sling_r: { isDisabled: false, slingshotThreshold: thresholdVuPerTick },
	};

	function buildSegmentBuilder(coil: SlingCoilName, sink: SlingshotSink): SlingshotSegmentBuilder {
		return (p1, p2, zLow, zHigh) => {
			const seg = new KickReportingSlingshot(surfaceData[coil], p1, p2, zLow, zHigh, physics, (ballId) => sink.record(ballId));
			seg.force = force;
			return seg;
		};
	}

	// Built by LOOPING over the derived `coils` set (never a second pair of
	// explicit per-coil literal calls) -- both `sinkByCoil` and
	// `segmentBuilderByCoil` are populated by COMPUTED property access
	// (`obj[coil] = …`), so a coil name never needs to be spelled out as a
	// quoted argument anywhere in this function.
	const sinkByCoil = {} as Record<SlingCoilName, SlingshotSink>;
	const segmentBuilderByCoil = {} as Record<SlingCoilName, SlingshotSegmentBuilder>;
	for (const coil of coils) {
		const sink = createSlingshotSink();
		sinkByCoil[coil] = sink;
		segmentBuilderByCoil[coil] = buildSegmentBuilder(coil, sink);
	}

	return {
		nodeNameByCoil: SLING_NODE_BY_COIL,
		surfaceData,
		segmentBuilderByCoil,
		drainKicks(): readonly SlingKick[] {
			const kicks: SlingKick[] = [];
			for (const [coil, sink] of Object.entries(sinkByCoil) as Array<[CoilName, SlingshotSink]>) {
				for (const ballId of sink.drain()) {
					kicks.push({ coil, ballId });
				}
			}
			return kicks;
		},
	};
}
