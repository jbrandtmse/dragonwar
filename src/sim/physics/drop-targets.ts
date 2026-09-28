// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-6, AD-2 -- the DRAGON drop-target bank. Owns the six `s_dragon_*`
// switches end to end (one source per switch, AD-2): a target drops on a
// GENUINE STRIKE on its own body, never on a zone make alone (this story's
// Design Notes, "The one real design decision: what causes a target to
// drop" -- a zone make already closes through a neighbour's own +2 mm
// margin, the exact vacuity AC 1b exists to catch).
//
// "Genuine strike" is read the same way `sim/physics/slings.ts` reads "the
// kick branch ran": `HitObject.collide()` fires once per RESOLVED collision
// -- the one hit object `PlayerPhysics.physicsSimulateCycle()` actually
// selected as this ball's nearest hit this sub-cycle, never a zone/box
// proximity guess (`game/player-physics.ts:363`, `pho.collide(ball.coll,
// this)`). `StrikeReportingLineSeg`/`StrikeReportingHitLineZ` are thin
// subclasses of the frozen `LineSeg`/`HitLineZ` port, each deferring
// entirely to `super.collide()` for the actual physics and reporting
// afterward through an injected sink -- the same DW-79 "wire from outside:
// construct, subclass, inject" shape `slings.ts` already uses, applied to
// two port classes instead of one because a target's 4-point footprint is 4
// `LineSeg` edges plus 4 `HitLineZ` corners (`loader/index.ts`'s own
// `addWall()`).
//
// `createDropTargetStrikeWiring()` is `loader/index.ts`'s own drop-in
// replacement for a plain `new LineSeg(...)` / `new HitLineZ(...)` at the
// six `col_dragon_<letter>` nodes' per-footprint construction sites (the
// sling precedent: a builder pair injected into `addWall()`, hit-object
// handles retained on the object this function returns). The moment ANY of
// a letter's 8 hit objects reports a strike, this wiring immediately and
// synchronously `setEnabled(false)`s ALL 8 of that letter's hit objects --
// deliberately DURING `physics.step()`, never deferred to the tick
// boundary, so a fast ball cannot register a second genuine strike against
// a target that is, physically, already falling. The strike itself --
// ballId and letter -- is buffered and drained after `physics.step()`
// returns, exactly like `slings.ts`'s own kick sink (a `collide()` call
// receives no `tick` argument of its own to stamp an edge/contact with).
//
// `createDropTargetMechanics()` is the actual hardware rule
// (`sim/physics/machine.ts` wires it): `applyPreStepReset()` joins
// `PRE_STEP_HARDWARE_RULES` (a bank reset must make every target
// collidable again BEFORE this tick's own solve, AC 2's own wording);
// `applyPostStep()` joins `SWITCH_EDGE_HARDWARE_RULES` (drains this tick's
// genuine strikes, latches each struck letter down, and emits its switch
// edge and contact -- disabling itself already happened synchronously in
// the wiring above, so this function's own job is bookkeeping and events
// only, never collidability).
//
// This file is authored, not ported (AD-16, declared in
// `test/port-provenance.test.ts`'s `AUTHORED_PHYSICS_FILE_RELATIVE_PATHS`
// and `tools/dependency-cruiser.config.mjs`'s `AUTHORED_PHYSICS_FILES`).
//
// DELIBERATELY does not import `BallStepMovement`/`ContactEventLike`/
// `SwitchEdgeLike`/`PulseCommandLike` from `./devices`: this file is
// imported BY `loader/index.ts` (the strike wiring below), and `devices.ts`
// itself imports `LoadedDevice`/`LoadedSwitchZone` FROM `loader/index.ts` --
// so importing devices.ts's own shapes here would close a three-file cycle
// (`loader -> drop-targets -> devices -> loader`) that `tools/
// dependency-cruiser.config.mjs`'s `no-circular` rule forbids the moment it
// touches more than one authored, non-exempt file (loader/index.ts's own
// header records the identical reasoning for why `pops.ts` never imports
// the OTHER way). The four local interfaces below are structurally
// IDENTICAL to their `devices.ts` namesakes -- built from the same
// non-cyclic primitives (`Ball`, `Vec3`, the contracts/table name unions) --
// so a `BallStepMovement[]`/`ContactEventLike[]`/`SwitchEdgeLike[]` computed
// by `machine.ts` is structurally assignable to and from them with no cast.
import { LineSeg } from './line-seg';
import { HitLineZ } from './hit-line-z';
import type { HitObject } from './hit-object';
import type { CollisionEvent } from './collision-event';
import type { Vertex2D } from './math/vertex2d';
import type { Ball } from './ball/ball';
import { TABLE } from '../table/dragonwar';
import type { Vec3 } from '../table/frames';
import type { BallDeviceName, CoilName, SwitchName } from '../table/names';
import type { ContactKind, ContactSurface } from '../contracts/events';

/** Structurally identical to `sim/physics/devices.ts`'s own `BallStepMovement` -- see this file's header for why it is not imported from there. */
interface BallStepMovementLike {
	readonly ball: Ball;
	readonly beforeMm: Vec3;
	readonly afterMm: Vec3;
}

/** Structurally identical to `sim/physics/devices.ts`'s own `ContactEventLike` -- see this file's header. */
interface ContactEventLikeLocal {
	readonly type: 'contact';
	readonly kind: ContactKind;
	readonly ballId?: number;
	readonly device?: BallDeviceName | CoilName;
	readonly pos?: Vec3;
	readonly surface?: ContactSurface;
	readonly tick: number;
}

/** Structurally identical to `sim/physics/devices.ts`'s own `SwitchEdgeLike` -- see this file's header. */
interface SwitchEdgeLikeLocal {
	readonly type: 'switch';
	readonly switch: SwitchName;
	readonly closed: boolean;
	readonly tick: number;
}

/** Structurally identical to `sim/physics/devices.ts`'s own `PulseCommandLike` -- see this file's header. */
interface PulseCommandLikeLocal {
	readonly coil: CoilName;
}

/** The six DRAGON-bank letters, derived from `TABLE.dropBankWiring`'s own key set -- never a second hand-typed letter list (DW-149). */
export type DropTargetLetter = keyof typeof TABLE.dropBankWiring;

/** One genuine strike, reported WITHOUT a `tick` -- `createDropTargetMechanics()` stamps the tick once it drains this after `physics.step()` returns (mirrors `sim/physics/slings.ts`'s `SlingKick`). */
export interface DropTargetStrike {
	readonly letter: DropTargetLetter;
	readonly ballId: number;
}

/** Every DRAGON target's own retained hit-object handles (`LineSeg` x4 + `HitLineZ` x4, one footprint corner/edge each) -- the only way to `setEnabled()` a target, since `PlayerPhysics` cannot rebuild its statics tree (this story's Block If). */
export type DropTargetHitObjectsByLetter = Readonly<Record<DropTargetLetter, readonly HitObject[]>>;

/**
 * Re-evaluates nothing -- unlike `slings.ts`'s `KickReportingSlingshot`
 * (which re-derives the base class's OWN kick-branch test before calling
 * `super.collide()` so it can report whether that specific branch ran),
 * every genuine `collide()` call already IS the observable this file wants:
 * `PlayerPhysics` never calls `collide()` on a hit object unless that
 * object was the ball's own nearest resolved hit this sub-cycle
 * (`game/player-physics.ts:363`). Calling `onStrike()` AFTER
 * `super.collide()` lets the real collision response (the target's own
 * material bounce) apply first; `onStrike()` itself is synchronous and
 * disables every one of this letter's 8 hit objects immediately (see this
 * file's header) before this sub-cycle's next hit test can even run.
 */
class StrikeReportingLineSeg extends LineSeg {
	private readonly onStrike: (ballId: number) => void;

	constructor(p1: Vertex2D, p2: Vertex2D, zLow: number, zHigh: number, onStrike: (ballId: number) => void) {
		super(p1, p2, zLow, zHigh);
		this.onStrike = onStrike;
	}

	public override collide(coll: CollisionEvent): void {
		super.collide(coll);
		this.onStrike(coll.ball.id);
	}
}

/** The corner-point counterpart of `StrikeReportingLineSeg` above -- see that class's own doc comment. */
class StrikeReportingHitLineZ extends HitLineZ {
	private readonly onStrike: (ballId: number) => void;

	constructor(xy: Vertex2D, zLow: number, zHigh: number, onStrike: (ballId: number) => void) {
		super(xy, zLow, zHigh);
		this.onStrike = onStrike;
	}

	public override collide(coll: CollisionEvent): void {
		super.collide(coll);
		this.onStrike(coll.ball.id);
	}
}

export type DropTargetSegmentBuilder = (p1: Vertex2D, p2: Vertex2D, zLow: number, zHigh: number) => LineSeg;
export type DropTargetPointBuilder = (xy: Vertex2D, zLow: number, zHigh: number) => HitLineZ;

export interface DropTargetStrikeWiring {
	/** Each letter's own `col_` node name -- `loader/index.ts`'s own node-name dispatch reads this instead of a local literal (mirrors `slings.ts`'s `nodeNameByCoil`). */
	readonly nodeNameByLetter: Readonly<Record<DropTargetLetter, string>>;
	/** One segment builder per letter, for `loader/index.ts` to call once per footprint EDGE of that letter's own node, in place of `new LineSeg(...)`. */
	readonly segmentBuilderByLetter: Readonly<Record<DropTargetLetter, DropTargetSegmentBuilder>>;
	/** One point builder per letter, for `loader/index.ts` to call once per footprint VERTEX of that letter's own node, in place of `new HitLineZ(...)`. */
	readonly pointBuilderByLetter: Readonly<Record<DropTargetLetter, DropTargetPointBuilder>>;
	/** Retained handles to every hit object the two builders above have constructed so far, keyed by letter -- `createDropTargetMechanics()`'s own `setEnabled(true)` path on a bank reset. */
	readonly hitObjectsByLetter: DropTargetHitObjectsByLetter;
	/** Every genuine strike recorded since the last call, in firing order, with no `tick` set yet (see this file's header). */
	drainStrikes(): readonly DropTargetStrike[];
}

/**
 * Builds the six targets' strike-reporting wiring. `loader/index.ts` calls
 * this once, before its own node loop, and dispatches `segmentBuilderByLetter`
 * / `pointBuilderByLetter` to `addWall()` for each `col_dragon_<letter>`
 * node -- exactly the sling precedent (a builder injected into `addWall()`'s
 * dispatch, surface/handle data returned on the object this function
 * builds).
 */
export function createDropTargetStrikeWiring(): DropTargetStrikeWiring {
	// DW-149 anti-vacuity: the letter set is TABLE.dropBankWiring's own key
	// set, never a hand-typed literal list -- a seventh target added to that
	// registry is covered automatically.
	const letters = Object.keys(TABLE.dropBankWiring) as DropTargetLetter[];
	if (letters.length === 0) {
		throw new Error('createDropTargetStrikeWiring(): TABLE.dropBankWiring has no target entries -- nothing to build');
	}

	const nodeNameByLetter = {} as Record<DropTargetLetter, string>;
	const segmentBuilderByLetter = {} as Record<DropTargetLetter, DropTargetSegmentBuilder>;
	const pointBuilderByLetter = {} as Record<DropTargetLetter, DropTargetPointBuilder>;
	const hitObjectsByLetter = {} as Record<DropTargetLetter, HitObject[]>;

	let pendingStrikes: DropTargetStrike[] = [];

	for (const letter of letters) {
		nodeNameByLetter[letter] = TABLE.dropBankWiring[letter].node;
		const objects: HitObject[] = [];
		hitObjectsByLetter[letter] = objects;

		const onStrike = (ballId: number): void => {
			// Immediate, synchronous disable (see this file's header): a
			// genuine strike on ANY of this letter's 8 hit objects takes the
			// WHOLE target out of the collision solve right away, so a fast
			// ball cannot register a second genuine strike against the same,
			// already-struck target within the same tick's remaining
			// sub-cycles -- `HitObject.setEnabled(false)` makes every one of
			// this file's own `hitTest()` overrides early-return `-1.0`
			// (`hit-object.ts`'s own header), the frozen "non-collidable"
			// semantic.
			for (const obj of objects) {
				obj.setEnabled(false);
			}
			pendingStrikes.push({ letter, ballId });
		};

		segmentBuilderByLetter[letter] = (p1, p2, zLow, zHigh) => {
			const seg = new StrikeReportingLineSeg(p1, p2, zLow, zHigh, onStrike);
			objects.push(seg);
			return seg;
		};
		pointBuilderByLetter[letter] = (xy, zLow, zHigh) => {
			const pt = new StrikeReportingHitLineZ(xy, zLow, zHigh, onStrike);
			objects.push(pt);
			return pt;
		};
	}

	return {
		nodeNameByLetter,
		segmentBuilderByLetter,
		pointBuilderByLetter,
		hitObjectsByLetter,
		drainStrikes(): readonly DropTargetStrike[] {
			const out = pendingStrikes;
			pendingStrikes = [];
			return out;
		},
	};
}

export interface DropTargetMechanicsResult {
	readonly switchEvents: SwitchEdgeLikeLocal[];
	readonly contactEvents: ContactEventLikeLocal[];
}

export interface DropTargetMechanics {
	/**
	 * Runs BEFORE `physics.step()` (`PRE_STEP_HARDWARE_RULES`): on a
	 * coil-enabled pulse of `TABLE.dropBankResetCoil`, `setEnabled(true)`s
	 * every target's hit objects (unconditionally, all six, AC 2's own
	 * wording -- "before this tick's solve") and emits one `closed: false`
	 * edge per target that was actually down (zero when none were) plus one
	 * `ContactEvent { kind: 'bank_reset' }`. A pulse with the coil disabled
	 * never reaches here at all (`machine.ts`'s own DW-74 enabled-pulse
	 * filter) and this function never has to special-case it.
	 */
	applyPreStepReset(tick: number, enabledPulses: readonly PulseCommandLikeLocal[]): DropTargetMechanicsResult;
	/**
	 * Runs AFTER `physics.step()`, before `step()`'s own return
	 * (`SWITCH_EDGE_HARDWARE_RULES`): drains every genuine strike the wiring
	 * recorded during this tick's solve, latches each newly-struck letter
	 * down, and emits its `closed: true` edge plus one
	 * `ContactEvent { kind: 'drop_target_down' }`. A letter already down is
	 * skipped (defensive -- unreachable in practice once `setEnabled(false)`
	 * has run, since a disabled hit object's `hitTest()` never fires
	 * `collide()` again).
	 */
	applyPostStep(tick: number, movements: readonly BallStepMovementLike[]): DropTargetMechanicsResult;
	/** The current down/up map for the snapshot, keyed by switch name (`DropTargetMechanismState`'s own shape) -- `true` means down. */
	readonly dropTargets: Readonly<Record<string, boolean>>;
}

/**
 * Builds the bank's own hardware rule from the wiring's retained handles and
 * strike sink (`createDropTargetStrikeWiring()`, above -- `loader/index.ts`
 * builds that; `machine.ts` wires its output into this function, mirroring
 * how `sim/physics/pops.ts` is handed `loadCollision()`'s own
 * `popCentroidsMm`).
 */
export function createDropTargetMechanics(options: {
	readonly hitObjectsByLetter: DropTargetHitObjectsByLetter;
	readonly drainStrikes: () => readonly DropTargetStrike[];
}): DropTargetMechanics {
	const { hitObjectsByLetter, drainStrikes } = options;

	// DW-149 anti-vacuity: same derivation as createDropTargetStrikeWiring()
	// above, independently re-derived here (never imported as a shared
	// constant) because the two functions are constructed by different
	// callers at different times (loader/index.ts vs machine.ts) and neither
	// needs the other's internal state -- both derive from the SAME TABLE
	// key set, so they can never drift apart.
	const letters = Object.keys(TABLE.dropBankWiring) as DropTargetLetter[];
	if (letters.length === 0) {
		throw new Error('createDropTargetMechanics(): TABLE.dropBankWiring has no target entries -- nothing to own');
	}
	const resetCoil = TABLE.dropBankResetCoil as CoilName;

	const down = {} as Record<DropTargetLetter, boolean>;
	for (const letter of letters) {
		down[letter] = false;
	}

	function applyPreStepReset(tick: number, enabledPulses: readonly PulseCommandLikeLocal[]): DropTargetMechanicsResult {
		const switchEvents: SwitchEdgeLikeLocal[] = [];
		const contactEvents: ContactEventLikeLocal[] = [];

		const pulsed = enabledPulses.some((command) => command.coil === resetCoil);
		if (!pulsed) {
			return { switchEvents, contactEvents };
		}

		for (const letter of letters) {
			// Unconditional, all six, every reset (AC 2: "all six report
			// isEnabled === true before this tick's solve") -- a target
			// that was never down is a harmless no-op `setEnabled(true)`.
			for (const obj of hitObjectsByLetter[letter]) {
				obj.setEnabled(true);
			}
			if (down[letter]) {
				down[letter] = false;
				switchEvents.push({ type: 'switch', switch: TABLE.dropBankWiring[letter].switch as SwitchName, closed: false, tick });
			}
		}
		contactEvents.push({ type: 'contact', kind: 'bank_reset', device: resetCoil, tick });

		return { switchEvents, contactEvents };
	}

	function applyPostStep(tick: number, movements: readonly BallStepMovementLike[]): DropTargetMechanicsResult {
		const switchEvents: SwitchEdgeLikeLocal[] = [];
		const contactEvents: ContactEventLikeLocal[] = [];

		for (const strike of drainStrikes()) {
			if (down[strike.letter]) {
				// Defensive only: unreachable in practice once the wiring's
				// own setEnabled(false) has run (see this file's header).
				// Code review finding (this pass): this guard is SILENT, not
				// loud -- if the "already disabled" guarantee it depends on
				// were ever violated, this `continue` swallows the spurious
				// strike with no edge, no contact, and no thrown error. Kept
				// silent deliberately (a double drop_target_down for an
				// already-down target is not itself a defect worth
				// surfacing to presentation), but stated honestly here
				// rather than claimed to fail loudly when it does not.
				continue;
			}
			down[strike.letter] = true;
			const sw = TABLE.dropBankWiring[strike.letter].switch as SwitchName;
			switchEvents.push({ type: 'switch', switch: sw, closed: true, tick });
			const movement = movements.find((m) => m.ball.id === strike.ballId);
			contactEvents.push({
				type: 'contact',
				kind: 'drop_target_down',
				ballId: strike.ballId,
				surface: 'target',
				pos: movement?.afterMm,
				tick,
			});
		}

		return { switchEvents, contactEvents };
	}

	return {
		applyPreStepReset,
		applyPostStep,
		get dropTargets(): Readonly<Record<string, boolean>> {
			const out: Record<string, boolean> = {};
			for (const letter of letters) {
				out[TABLE.dropBankWiring[letter].switch] = down[letter];
			}
			return out;
		},
	};
}
