// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AD-15: "Physics is tested by replaying test/replays/*.replay.json (schema
// in sim/contracts/replay.ts) and asserting the state hash: FNV-1a over
// canonical JSON of GameState plus ball positions quantised to 0.01 mm;
// goldens are recorded in Node in CI, and browser parity is asserted on
// GameState only." This file SHIPS that definition -- promoted verbatim in
// behaviour from its test-local original (test/loop-determinism.test.ts,
// Story 1.5), which now re-points here so exactly one implementation of the
// hash exists.
//
// Pure (AD-1, AD-3, AD-16): no DOM, no wall clock, no unseeded randomness,
// no file I/O. `runReplay()` accepts an already-parsed collision document
// and an in-memory `Replay` -- every reader of a `.golden.json` file lives in
// `test/**` or `src/host/dev/**` (this story's own "Always" rule); this
// module never calls `readFileSync` or fetches anything.
//
// `TICK_HZ` is never named here (AD-3's own rule: it may be named only in
// `sim/contracts/time.ts` and `sim/table/tuning.ts`) -- `LIVE_TICK_HZ` below
// is derived from `SECONDS_PER_TICK` (`1 / SECONDS_PER_TICK`), which is
// itself derived from `TICK_HZ` but does not carry the literal identifier as
// a token, so `pnpm lint:boundaries`' textual tick/ms rule is satisfied by
// construction rather than by exemption.

import { createLoop } from './index';
import { ticksToMs, SECONDS_PER_TICK } from '../contracts/time';
import { resolveTuning } from '../table/tuning';
import { TABLE } from '../table/dragonwar';
import {
	BALL_BALL_RESTITUTION,
	C_CONTACTVEL,
	C_DISP_GAIN,
	C_DISP_LIMIT,
	C_INTERATIONS,
	C_LOWNORMVEL,
	C_PRECISION,
	PHYS_FACTOR,
	PHYS_SKIN,
	PHYS_TOUCH,
	PHYSICS_STEPTIME,
	STATICTIME,
	VELOCITY_EPSILON,
} from '../physics/constants';
import type { CoilName, GameStart, GameState, ReplayHeader, Replay, SemanticEvent, Snapshot } from '../table/names';
import type { BallSnapshot } from '../contracts/snapshot';

/** The live tick rate, derived without ever naming `TICK_HZ` (see this file's header). */
const LIVE_TICK_HZ = Math.round(1 / SECONDS_PER_TICK);

// ---------------------------------------------------------------------------
// The canonical-JSON state hash (AD-15), promoted from
// test/loop-determinism.test.ts:33-68 verbatim in behaviour, plus a named
// rejection of the two values JSON.stringify silently mishandles.
// ---------------------------------------------------------------------------

/** Thrown by `canonicalize()` for a value `JSON.stringify` would otherwise silently mishandle (a non-finite number collapses to `null`; `undefined` is dropped from an object, or turns into `null` inside an array) -- named with the exact path, so a shipped hash never encodes a silent collision between "genuinely null/absent" and "a bug produced NaN". */
export class NonCanonicalValueError extends Error {}

function canonicalizeAt(value: unknown, path: string): unknown {
	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw new NonCanonicalValueError(`canonicalize(): non-finite number (${String(value)}) at "${path}" -- JSON.stringify would silently collapse this to null`);
	}
	if (value === undefined) {
		throw new NonCanonicalValueError(`canonicalize(): undefined value at "${path}" -- JSON.stringify would silently drop this (as a key, or as null inside an array)`);
	}
	if (typeof value === 'bigint') {
		throw new NonCanonicalValueError(`canonicalize(): bigint value (${String(value)}n) at "${path}" -- JSON.stringify throws its own generic, unnamed TypeError for a bigint anywhere in the tree; this rejects it earlier, with the path named`);
	}
	if (typeof value === 'symbol') {
		throw new NonCanonicalValueError(`canonicalize(): symbol value (${String(value)}) at "${path}" -- JSON.stringify would silently drop this (as a key, or as null inside an array)`);
	}
	if (typeof value === 'function') {
		throw new NonCanonicalValueError(`canonicalize(): function value at "${path}" -- JSON.stringify would silently drop this (as a key, or as null inside an array)`);
	}
	if (Array.isArray(value)) {
		return value.map((v, i) => canonicalizeAt(v, `${path}[${i}]`));
	}
	if (value !== null && typeof value === 'object') {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[key] = canonicalizeAt((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
		}
		return sorted;
	}
	return value;
}

/** Recursive `Object.keys().sort()` canonical form, over `value`'s own JSON-serialisable tree -- object keys sorted at every depth, arrays left in their own (meaningful) order. Throws `NonCanonicalValueError` (named path) rather than letting a non-finite number or an `undefined` collapse silently, per this story's own I/O matrix row ("Non-finite in state: rejected with a named path"). */
export function canonicalize(value: unknown): unknown {
	return canonicalizeAt(value, '$');
}

/** AD-15's own quantisation: round to the nearest 0.01 mm. */
export function quantize001Mm(mm: number): number {
	return Math.round(mm * 100) / 100;
}

/** 32-bit FNV-1a, hex-encoded, NOT zero-padded (AD-15's own definition, verbatim). */
export function fnv1aHex(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}

/** AD-15: "FNV-1a over canonical JSON of GameState plus ball positions quantised to 0.01 mm". Balls are reduced to `{ id, pos }` -- velocity and the derived `speed` are display-only (`sim/loop/index.ts`'s own `buildSnapshot()`), never part of the hashed state. */
export function stateHash(game: GameState, balls: readonly BallSnapshot[]): string {
	const quantizedBalls = balls.map((b) => ({
		id: b.id,
		pos: { x: quantize001Mm(b.pos.x), y: quantize001Mm(b.pos.y), z: quantize001Mm(b.pos.z) },
	}));
	const payload = canonicalize({ game, balls: quantizedBalls });
	return fnv1aHex(JSON.stringify(payload));
}

/**
 * The `GameState`-ONLY portion of the hash (no ball positions) -- for
 * BROWSER PARITY (AD-15's own Prevents entry: "a golden that fails because
 * Safari's Math.sin differs from V8's" is exactly why ball positions, which
 * are the one part of the hashed state a differing transcendental
 * implementation could disturb, are asserted in Node ALONE; `game` itself
 * carries no floating-point physics output at all in Epic 1 -- it is
 * tick/phase/machine bookkeeping -- so it is safe to compare across engines).
 */
export function gameStateHash(game: GameState): string {
	return fnv1aHex(JSON.stringify(canonicalize(game)));
}

// ---------------------------------------------------------------------------
// Identity hashes: the table registry, an asset document, and the physics
// version -- the four fields (plus tickHz) a golden's header carries and a
// replay run verifies BEFORE ever computing a state hash (this story's own
// "Always" rule: "A golden that breaks must say why").
// ---------------------------------------------------------------------------

/** Hashes the live, frozen `TABLE` registry (canonical JSON, AD-11's single source of truth) -- changing any switch, coil, device or reference dimension changes this. */
export function tableHash(): string {
	return fnv1aHex(JSON.stringify(canonicalize(TABLE)));
}

/** Hashes an already-PARSED asset document (a collision JSON document, or any other JSON-serialisable asset payload) -- never raw file bytes (this story's own "Always" rule: `core.autocrlf=true` means a byte-wise comparison differs Windows-vs-CI; hashing the PARSED structure is immune to line-ending differences entirely, since `JSON.parse` already normalised them away). */
export function assetHash(doc: unknown): string {
	return fnv1aHex(JSON.stringify(canonicalize(doc)));
}

/**
 * AD-3/AD-15: "changing one [solver constant] is a physics-version bump that
 * re-records every golden" -- and the same is true of `TICK_HZ` (AD-3: "if
 * spike 1 forces 480 Hz, that constant changes and golden replays are
 * re-recorded"). Derived, never hand-written, so the re-record obligation
 * enforces itself: this hashes every constant `test/sim-boundary.test.ts`'s
 * own AD-15 pin asserts by name, plus the live tick rate. `physicsStepTimeUs`
 * duplicates `PHYSICS_STEPTIME` under a table-safe key name only (never
 * `…Ms`) -- it is MICROSECONDS (the constant's own unit, `constants.ts`'s
 * comment: "usecs to go between each physics update"), not a millisecond
 * duration this file converts, so it does not trip `pnpm lint:boundaries`'
 * tick/ms rule.
 */
export const PHYSICS_VERSION: string = (() => {
	const payload = canonicalize({
		tickHz: LIVE_TICK_HZ,
		physicsStepTimeUs: PHYSICS_STEPTIME,
		physFactor: PHYS_FACTOR,
		physSkin: PHYS_SKIN,
		physTouch: PHYS_TOUCH,
		cPrecision: C_PRECISION,
		cLowNormVel: C_LOWNORMVEL,
		cContactVel: C_CONTACTVEL,
		cDispGain: C_DISP_GAIN,
		cDispLimit: C_DISP_LIMIT,
		staticTime: STATICTIME,
		velocityEpsilon: VELOCITY_EPSILON,
		ballBallRestitution: BALL_BALL_RESTITUTION,
		cInterations: C_INTERATIONS,
	});
	return `v1-${fnv1aHex(JSON.stringify(payload))}`;
})();

// ---------------------------------------------------------------------------
// buildHeader() / runReplay() -- AC 1 and AC 2.
// ---------------------------------------------------------------------------

export interface BuildHeaderOptions {
	readonly gameStart: GameStart;
	readonly physicsSeed: number;
	/** An already-parsed collision document (AD-1: sim/ never parses a file itself). */
	readonly collisionDoc: unknown;
}

/** AC 1: "its header embeds the whole GameStart, physicsSeed, tickHz, tableHash, assetHash and physicsVersion." Every field is computed live except `gameStart`/`physicsSeed`, which the caller (the recorder, `src/host/dev/replay-recorder.ts`) supplies. */
export function buildHeader(options: BuildHeaderOptions): ReplayHeader {
	return {
		gameStart: options.gameStart,
		physicsSeed: options.physicsSeed,
		tickHz: LIVE_TICK_HZ,
		tableHash: tableHash(),
		assetHash: assetHash(options.collisionDoc),
		physicsVersion: PHYSICS_VERSION,
	};
}

/** Thrown by `runReplay()` when a header field, or the resolved tuning, no longer matches the live environment -- named, and thrown BEFORE any hash is computed (this story's own "Always" rule). Never thrown for a hash MISMATCH itself -- that is a plain, named `expect()` failure at the call site, not this class. */
export class StaleReplayHeaderError extends Error {}

/** Thrown by `runReplay()` when a `coilPrologue` entry's `tick` falls outside `[1, durationTicks]` -- named, and thrown BEFORE any hashing/replay work runs (same "Always" rule as `StaleReplayHeaderError`). An out-of-range tick would otherwise never fire, silently, since the main tick loop only runs `1..durationTicks`. */
export class InvalidCoilPrologueError extends Error {}

/** Thrown by `runReplay()` when `durationTicks`, a `replay.transitions` tick, or a `checkpointTicks` entry falls outside the range the tick loop actually runs (`[1, durationTicks]`, integers) -- named, and thrown BEFORE any replay work runs. Review finding 2026-08-29 (code review): `coilPrologue` already had this guard and its own rationale ("an out-of-range tick would otherwise silently never fire"), but the SAME hazard was unguarded on the other three inputs. `sim/loop`'s `frameInForceAt()` applies a pending transition as soon as `transition.tick <= tick`, so a transition stamped at or below 1 silently fires EARLIER than the golden declares, and one stamped above `durationTicks` never fires at all -- either way the recorded hash stops describing the scenario the golden's own data claims, with no error. */
export class InvalidReplayRangeError extends Error {}

function assertHeaderMatchesLiveEnvironment(header: ReplayHeader, collisionDoc: unknown): void {
	if (header.tickHz !== LIVE_TICK_HZ) {
		throw new StaleReplayHeaderError(
			`runReplay(): header.tickHz (${header.tickHz}) does not match the live tick rate (${LIVE_TICK_HZ}) -- ` +
			`the simulation clock changed since this replay was recorded. Re-record it deliberately; do not investigate the hash.`,
		);
	}
	const liveTableHash = tableHash();
	if (header.tableHash !== liveTableHash) {
		throw new StaleReplayHeaderError(
			`runReplay(): header.tableHash (${header.tableHash}) does not match the live TABLE hash (${liveTableHash}) -- ` +
			`sim/table/dragonwar.ts's TABLE registry changed since this replay was recorded. Re-record it deliberately; do not investigate the hash.`,
		);
	}
	const liveAssetHash = assetHash(collisionDoc);
	if (header.assetHash !== liveAssetHash) {
		throw new StaleReplayHeaderError(
			`runReplay(): header.assetHash (${header.assetHash}) does not match the live collision-document hash (${liveAssetHash}) -- ` +
			`the collision document changed since this replay was recorded. Re-record it deliberately; do not investigate the hash.`,
		);
	}
	if (header.physicsVersion !== PHYSICS_VERSION) {
		throw new StaleReplayHeaderError(
			`runReplay(): header.physicsVersion (${header.physicsVersion}) does not match the live PHYSICS_VERSION (${PHYSICS_VERSION}) -- ` +
			`a pinned solver constant or the tick rate changed since this replay was recorded. Re-record it deliberately; do not investigate the hash.`,
		);
	}
	const liveTuningCanonical = JSON.stringify(canonicalize(resolveTuning()));
	const headerTuningCanonical = JSON.stringify(canonicalize(header.gameStart.tuning));
	if (headerTuningCanonical !== liveTuningCanonical) {
		throw new StaleReplayHeaderError(
			`runReplay(): header.gameStart.tuning no longer matches the live resolveTuning() output -- ` +
			`a tunable in sim/table/tuning.ts changed since this replay was recorded. Re-record it deliberately; do not investigate the hash.`,
		);
	}
}

/** One declared, data-only coil pulse (this story's AC 4 amendment): the golden file's own `coilPrologue`, applied by `runReplay()` at the stated tick, exactly as `loop.pulseCoil()` would be called by a dev action. Never part of the shipped `Replay` type (AD-4's own shape is unchanged) -- carried alongside it in the golden file, and owned entirely by the caller (`test/replay-goldens.test.ts`), not this module. */
export interface CoilPrologueEntry {
	readonly tick: number;
	readonly coil: CoilName;
}

export interface RunReplayOptions {
	readonly replay: Replay;
	/** An already-parsed collision document (AD-1). */
	readonly collisionDoc: unknown;
	/** How many ticks to run -- a replay carries no implicit "end", so the caller states it (the golden file's own `durationTicks`). */
	readonly durationTicks: number;
	/** Story 1.8's AC 4 amendment: the declared coil-pulse sequence that puts a ball in play, applied at its stated ticks, exactly as a dev pulse would be. Empty/omitted for a replay that needs none. */
	readonly coilPrologue?: readonly CoilPrologueEntry[];
	/** Ticks at which to CAPTURE the frame's snapshot for the caller's own inspection (returned in `checkpoints`) -- e.g. the golden runner re-asserting the declared coil prologue's own effect (AC 4: "re-asserted on replay"), which is a claim about MID-run state this module has no opinion on the shape of. */
	readonly checkpointTicks?: readonly number[];
	/** Called after EVERY tick with that tick's snapshot -- for a whole-run property no fixed set of checkpoints can express (e.g. the two-ball golden's "separation never drops below one ball diameter, at any tick", not merely at a few sampled ones). Never throws from inside `runReplay()` itself; a caller that wants to fail fast may throw from its own callback, which propagates out of `runReplay()` unchanged. */
	readonly onTick?: (tick: number, snapshot: Snapshot) => void;
}

export interface RunReplayResult {
	readonly finalSnapshot: Snapshot;
	/** AD-15's full hash: GameState + quantised ball positions. */
	readonly finalHash: string;
	/** The GameState-only portion (AD-15's browser-parity hash). */
	readonly finalGameStateHash: string;
	/** Snapshots captured at each of `options.checkpointTicks`, keyed by tick. */
	readonly checkpoints: ReadonlyMap<number, Snapshot>;
	/** Every `SemanticEvent` emitted across the whole run, in tick order -- e.g. so a golden's own runner can re-assert a specific event (the full-plunge golden's `ball_launched`, DW-66) without `runReplay()` needing an opinion on which one matters. */
	readonly events: readonly SemanticEvent[];
}

/**
 * AC 2: "given the same header, body and declared coil prologue, when the
 * replay is run twice, both runs produce the identical state hash." Verifies
 * `tickHz`, `tableHash`, `assetHash`, `physicsVersion` and the resolved
 * tuning against the header BEFORE ever computing a hash (this story's own
 * "Always" rule) -- a stale header throws `StaleReplayHeaderError`, naming
 * exactly which input changed, rather than producing a hash the caller might
 * mistake for a genuine mismatch.
 *
 * Drives a FRESH `createLoop()` tick-by-tick (never naming `TICK_HZ` -- see
 * this file's header): `replay.transitions` are all seeded on a single
 * `advance(0, transitions)` call (which enqueues them without stepping,
 * `sim/loop/index.ts`'s own `owedTicks === 0` short-circuit), matching how
 * `sim/loop` itself retains a transition until its tick is reached; each
 * `coilPrologue` entry's `pulseCoil()` call is issued immediately before the
 * `advance()` call for its own tick, landing on that exact tick
 * (`sim/loop`'s own "commands land the tick they are issued for, when
 * queued before that tick's advance() call" semantics).
 */
export function runReplay(options: RunReplayOptions): RunReplayResult {
	const { replay, collisionDoc, durationTicks, coilPrologue = [], checkpointTicks = [], onTick } = options;

	assertHeaderMatchesLiveEnvironment(replay.header, collisionDoc);

	// Range validation, all of it BEFORE any replay work (this story's own
	// "Always" rule: a golden that breaks must say why). `durationTicks` is
	// checked first because every other range message quotes it.
	if (!Number.isInteger(durationTicks) || durationTicks < 1) {
		throw new InvalidReplayRangeError(
			`runReplay(): durationTicks must be a positive integer, got ${String(durationTicks)} -- ` +
			`the tick loop runs 1..durationTicks, so anything else replays nothing and hashes the un-advanced initial state.`,
		);
	}
	for (let i = 0; i < replay.transitions.length; i++) {
		const tick = replay.transitions[i]!.tick;
		if (!Number.isInteger(tick) || tick < 1 || tick > durationTicks) {
			throw new InvalidReplayRangeError(
				`runReplay(): replay.transitions[${i}] has tick ${String(tick)}, outside the valid range [1, ${durationTicks}] -- ` +
				`sim/loop applies a pending transition as soon as its tick is REACHED, so a tick below 1 fires earlier than declared ` +
				`and a tick above durationTicks never fires at all. Fix the replay's transitions or its durationTicks.`,
			);
		}
	}
	for (let i = 0; i < checkpointTicks.length; i++) {
		const tick = checkpointTicks[i]!;
		if (!Number.isInteger(tick) || tick < 1 || tick > durationTicks) {
			throw new InvalidReplayRangeError(
				`runReplay(): checkpointTicks[${i}] is ${String(tick)}, outside the valid range [1, ${durationTicks}] -- ` +
				`it would silently be absent from the returned checkpoints map, and the caller's own lookup would fail as an ` +
				`unexplained undefined instead of naming the real mistake here.`,
			);
		}
	}

	for (let i = 0; i < coilPrologue.length; i++) {
		const entry = coilPrologue[i];
		if (!Number.isInteger(entry.tick) || entry.tick < 1 || entry.tick > durationTicks) {
			throw new InvalidCoilPrologueError(
				`runReplay(): coilPrologue[${i}] has tick ${entry.tick}, outside the valid range [1, ${durationTicks}] -- ` +
				`an out-of-range tick would otherwise silently never fire. Fix the golden's coilPrologue or its durationTicks.`,
			);
		}
	}

	const loop = createLoop({ collisionDoc });

	const prologueByTick = new Map<number, CoilName[]>();
	for (const entry of coilPrologue) {
		const list = prologueByTick.get(entry.tick) ?? [];
		list.push(entry.coil);
		prologueByTick.set(entry.tick, list);
	}
	const checkpointSet = new Set(checkpointTicks);
	const checkpoints = new Map<number, Snapshot>();
	const events: SemanticEvent[] = [];

	// Seed every transition without stepping -- elapsedMs = 0 owes 0 ticks,
	// which is `advance()`'s own early-return path (`sim/loop/index.ts`), but
	// `transitions` are pushed into the internal queue BEFORE that check runs.
	let out = loop.advance(0, replay.transitions);

	for (let tick = 1; tick <= durationTicks; tick++) {
		for (const coil of prologueByTick.get(tick) ?? []) {
			loop.pulseCoil(coil);
		}
		out = loop.advance(ticksToMs(1), []);
		events.push(...out.events);
		if (checkpointSet.has(tick)) {
			checkpoints.set(tick, out.snapshot);
		}
		onTick?.(tick, out.snapshot);
	}

	return {
		finalSnapshot: out.snapshot,
		finalHash: stateHash(out.snapshot.game, out.snapshot.balls),
		finalGameStateHash: gameStateHash(out.snapshot.game),
		checkpoints,
		events,
	};
}
