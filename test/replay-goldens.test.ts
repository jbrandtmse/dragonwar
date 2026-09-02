// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8, Phase 2: the five golden replays (AD-15, epic context: "the
// golden set is five replays ... roll-and-drain, hold-and-release, full
// plunge, nudge coupling, and a two-ball collision"), recorded under
// test/replays/*.golden.json and replayed here through the SHIPPED
// src/sim/loop/replay.ts -- the same module a browser parity page
// (tools/replay-parity/) and Story 1.9's feel ritual will use.
//
// PROVENANCE NOTE (spec Design Notes, "The goldens bake DW-70's value into
// the reference hash"): `stateHash()` hashes the whole `game` tree, which
// includes `machine.deviceSlots` -- every golden below therefore freezes the
// LOOP-WRITTEN value of `deviceSlots` (the live AD-7 violation tracked as
// `DW-70`, `sim/loop/index.ts:326-329`) as part of its reference hash. If
// Story 2.5's fix is faithful the values will be identical and nothing
// breaks; if a golden here ever breaks on `deviceSlots` alone, check DW-70
// before assuming the physics changed. Each golden file's own `notes` field
// repeats this next to the data itself, per that Design Notes section's own
// instruction.
//
// AC 4 (amended): each golden's own `coilPrologue` -- the `pulseCoil`
// sequence that puts a ball in play, since nothing in an `InputTransition[]`
// body can reach a coil (RulesStepResult.commands is `readonly never[]`,
// the rules layer cannot issue one) -- is DATA in the golden file, re-applied
// and implicitly re-asserted on every replay: if the prologue no longer
// reproduces the SAME effect, the final hash simply will not match, which is
// exactly "fails naming the prologue" in the only sense a hash comparison
// can name anything -- the per-golden describe blocks below additionally
// checkpoint and assert the prologue's own MID-run effect directly (e.g. "a
// ball existed by tick X"), which is the failure a bare hash mismatch alone
// would not localise to the prologue specifically.
//
// Story 2.5 removes the prologue once Start serves through the rules layer,
// and re-records every golden then -- do not widen this mechanism further.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	canonicalize,
	InvalidCoilPrologueError,
	InvalidReplayRangeError,
	NonCanonicalValueError,
	runReplay,
	StaleReplayHeaderError,
	type CoilPrologueEntry,
} from '../src/sim/loop/replay';
import { MM_PER_VU } from '../src/sim/table/frames';
import { TABLE } from '../src/sim/table/dragonwar';
import type { InputTransition } from '../src/sim/contracts/input';
import type { Replay, ReplayHeader } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');
const REPLAYS_DIR = path.resolve(__dirname, 'replays');

function loadCollisionDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/**
 * The golden file's own shape -- a superset of `Replay` (AC 1's shipped type
 * is NOT widened; the prologue and the expected hashes ride ALONGSIDE it,
 * test-local only, per this story's AC 4 amendment and "Always" rule).
 */
interface GoldenFile {
	readonly name: string;
	readonly description: string;
	readonly header: ReplayHeader;
	readonly transitions: readonly InputTransition[];
	readonly coilPrologue: readonly CoilPrologueEntry[];
	readonly durationTicks: number;
	readonly expectedHash: string;
	readonly expectedGameStateHash: string;
	readonly notes: string;
}

const GOLDEN_NAMES = ['roll-and-drain', 'hold-and-release', 'full-plunge', 'nudge-coupling', 'two-ball-collision'] as const;

function loadGolden(name: (typeof GOLDEN_NAMES)[number]): GoldenFile {
	const raw = readFileSync(path.join(REPLAYS_DIR, `${name}.golden.json`), 'utf8');
	return JSON.parse(raw) as GoldenFile;
}

function toReplay(golden: GoldenFile): Replay {
	return { header: golden.header, transitions: golden.transitions };
}

// NAMING DEVIATION FROM AD-15, RECORDED WHERE THE ARTIFACT LIVES (review
// finding 2026-08-29): AD-15's rule text, and the spine's own repo-layout
// tree, both name these files `test/replays/*.replay.json`. They ship as
// `*.golden.json` because the file is deliberately a SUPERSET of the
// `Replay` type AD-15 points at (`sim/contracts/replay.ts`): it also carries
// this story's declared `coilPrologue`, `durationTicks`, the two expected
// hashes and the DW-70 provenance `notes`. Naming it `*.replay.json` would
// claim it matches that schema, which it does not. The distinction is also
// load-bearing forward: `epics.md`'s Epic 6 playtest story lands
// `test/replays/playtest-*.replay.json` in this SAME directory, and neither
// GOLDEN_NAMES below nor tools/replay-parity/serve.mjs's index route picks
// those up -- correct, because they are not goldens, but only safe if the
// distinction is written down rather than rediscovered.
describe('test/replays/*.golden.json -- every golden replays to its recorded hash', () => {
	// Review finding 2026-08-29: GOLDEN_NAMES is a hardcoded five-element
	// tuple while tools/replay-parity/serve.mjs enumerates the directory, so a
	// SIXTH golden added under test/replays/ would be replayed and judged by
	// the browser parity page while being silently untested in Node and in CI
	// -- the authoritative leg (AD-15: "goldens are recorded in Node in CI").
	it('GOLDEN_NAMES covers every *.golden.json on disk -- a golden added to test/replays/ can never be silently untested in Node', () => {
		const onDisk = readdirSync(REPLAYS_DIR)
			.filter((f) => f.endsWith('.golden.json'))
			.map((f) => f.slice(0, -'.golden.json'.length))
			.sort();
		expect(onDisk.length, 'sanity: there must actually be golden files on disk, or this check is vacuous').toBeGreaterThan(0);
		expect(
			onDisk,
			'every *.golden.json under test/replays/ must appear in GOLDEN_NAMES (and vice versa) -- a golden the Node runner does not know about is invisible to CI while still being judged by tools/replay-parity/',
		).toEqual([...GOLDEN_NAMES].sort());
	});

	it.each(GOLDEN_NAMES)('%s: finalHash and finalGameStateHash match the recorded goldens', (name) => {
		const golden = loadGolden(name);
		const result = runReplay({
			replay: toReplay(golden),
			collisionDoc: loadCollisionDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
		});
		expect(result.finalHash, `${name}: finalHash`).toBe(golden.expectedHash);
		expect(result.finalGameStateHash, `${name}: finalGameStateHash (the browser-parity, GameState-only portion)`).toBe(golden.expectedGameStateHash);
	});

	it.each(GOLDEN_NAMES)('%s: replayed TWICE from the same header+body+prologue produces the IDENTICAL hash both times (AC 2)', (name) => {
		const golden = loadGolden(name);
		const collisionDoc = loadCollisionDoc();
		const first = runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });
		const second = runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });
		expect(second.finalHash, 'two runs of the identical replay must produce the identical hash').toBe(first.finalHash);
		expect(second.finalGameStateHash).toBe(first.finalGameStateHash);
	});

	it.each(GOLDEN_NAMES)('%s: every DW-70 provenance note is present next to the golden\'s own data', (name) => {
		const golden = loadGolden(name);
		expect(golden.notes, `${name}: notes must name DW-70`).toContain('DW-70');
		expect(golden.notes, `${name}: notes must name deviceSlots`).toContain('deviceSlots');
	});

	it.each(GOLDEN_NAMES)('%s: golden checked out with CRLF line endings hashes IDENTICALLY to LF -- goldens are JSON-parsed, never byte-compared', (name) => {
		// Review finding 2026-08-29: this used to read the file raw and call it
		// "lf". On a Windows checkout with `core.autocrlf=true` -- the exact
		// configuration this test exists for -- the bytes on disk are already
		// CRLF, so `.replace(/\n/g, '\r\n')` produced CR-CRLF and the test
		// compared CRLF against CR-CRLF, never LF against CRLF at all.
		// Normalising FIRST makes the two sides genuinely LF and CRLF on every
		// checkout. HONEST LIMIT, stated rather than implied: because
		// `runReplay()` takes an already-PARSED `Replay` and no code path in
		// this repository ever byte-compares a golden, this asserts a property
		// the DESIGN makes structural -- it is a regression guard against a
		// future byte comparison being introduced, not a discriminating check
		// against today's code.
		const rawOnDisk = readFileSync(path.join(REPLAYS_DIR, `${name}.golden.json`), 'utf8');
		const lfRaw = rawOnDisk.replace(/\r\n/g, '\n');
		expect(lfRaw, 'sanity: the LF side must genuinely contain no CRLF, whatever the checkout did').not.toContain('\r\n');
		const crlfRaw = lfRaw.replace(/\n/g, '\r\n');
		expect(crlfRaw, 'sanity: the CRLF conversion must have actually changed the raw bytes, or this test proves nothing').not.toBe(lfRaw);

		const lfGolden = JSON.parse(lfRaw) as GoldenFile;
		const crlfGolden = JSON.parse(crlfRaw) as GoldenFile;
		const collisionDoc = loadCollisionDoc();

		const lfResult = runReplay({ replay: toReplay(lfGolden), collisionDoc, durationTicks: lfGolden.durationTicks, coilPrologue: lfGolden.coilPrologue });
		const crlfResult = runReplay({ replay: toReplay(crlfGolden), collisionDoc, durationTicks: crlfGolden.durationTicks, coilPrologue: crlfGolden.coilPrologue });

		expect(crlfResult.finalHash, `${name}: CRLF-checked-out hash must equal the LF one`).toBe(lfResult.finalHash);
	});
});

// AC 5's browser-parity leg judges PASS/FAIL on `finalGameStateHash` alone
// (AD-15's own Prevents entry: "a golden that fails because Safari's Math.sin
// differs from V8's"). Review finding 2026-08-29: nothing measured how much
// that hash actually depends on each golden's own body, and the answer is
// "for three of the five, not at all" -- Epic 1's `GameState` is tick/phase/
// machine bookkeeping only, so a flipper press or a nudge, which move the
// BALL, leave it untouched. That is a property of AD-15's deliberate design,
// not a defect, and re-recording a golden to change it is forbidden by this
// story's own Never rule. What was missing is that the property was
// INVISIBLE: the parity page can report "5/5 PASS" while a browser applies no
// input at all. This makes it explicit, enforced, and impossible to drift
// silently -- a golden that gains parity sensitivity must be taken off the
// allowlist, and one that loses it must be added with a reason.
describe('AC 5 parity-hash falsifiability: which goldens\' GameState-only hash actually depends on their own body', () => {
	/**
	 * Goldens whose `finalGameStateHash` is provably INSENSITIVE to their own
	 * `transitions`, each with the reason. Measured 2026-08-29; re-verified
	 * 2026-08-31 after Story 2.1a task 25 (DW-119 residual) reshaped
	 * col_wall_bottom_l/_r's own top edge from a dead-flat face into a ramp.
	 *
	 * `hold-and-release` REMOVED this pass: its own reason used to read "the
	 * ball neither launches nor drains within this golden" -- true only
	 * because, on the OLD flat-topped wall, a ball with no sideways force
	 * ever reaching col_wall_bottom_l simply parked there forever, identically
	 * whether or not the flipper had touched it first, within the golden's
	 * 8110-tick window. The new sloped face gives every such ball a genuine,
	 * non-zero drift toward the drain, and the flipper's own deflection
	 * during the recorded hold measurably changes how fast it gets there:
	 * WITH the body, the ball reaches bd_trough by tick 8110 (matching this
	 * golden's own `description`, "drains shortly after release", which the
	 * pre-fix geometry could not actually deliver inside the window);
	 * WITHOUT it, the ball is still mid-drift, not yet parked or drained.
	 * That is a genuine, desirable gain in parity-hash sensitivity, not a
	 * scenario break -- the golden's own per-golden test below (contact,
	 * hold, deflection) is unaffected.
	 */
	const PARITY_INERT: Readonly<Record<string, string>> = {
		'nudge-coupling':
			'the nudge moves the cabinet and hence the ball, but Epic 1 has no tilt bob wired into GameState.machine.tilt for a single sub-threshold nudge, so nothing the nudge touches reaches GameState.',
		'two-ball-collision':
			'its `transitions` array is empty by design -- the whole scenario is driven by the declared coilPrologue, so there is no body for the parity hash to be sensitive to.',
		'roll-and-drain':
			'Story 2.1b rework iteration 3 (2026-09-02) re-recorded this golden with an empty `transitions` array by design -- the plunge-routing fix (col_loop_r_deflector re-sited, col_loop_top shortened) lets the served ball cross the top and drain on its own, with NO flipper input needed or given, so the whole scenario is driven by its declared coilPrologue alone, the same shape two-ball-collision already uses.',
	};

	it.each(GOLDEN_NAMES)('%s: parity-hash sensitivity to its own transitions matches its declared status', (name) => {
		const golden = loadGolden(name);
		const collisionDoc = loadCollisionDoc();
		const withBody = runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });
		const withoutBody = runReplay({ replay: { header: golden.header, transitions: [] }, collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });

		const inertReason = PARITY_INERT[name];
		if (golden.transitions.length === 0) {
			// No body at all, so "with body" and "without body" are the SAME
			// run and neither hash can differ -- there is nothing to falsify.
			// Such a golden must say so on PARITY_INERT rather than quietly
			// benefiting from the weaker branch below.
			expect(
				inertReason,
				`${name} has an EMPTY transitions array, so neither hash can depend on its body -- it must be declared on PARITY_INERT with that reason, never left to look like a body-sensitive golden`,
			).toBeDefined();
			expect(withoutBody.finalHash, `${name}: sanity -- an empty body replayed twice must be identical`).toBe(withBody.finalHash);
			return;
		}
		if (inertReason === undefined) {
			expect(
				withoutBody.finalGameStateHash,
				`${name} is NOT on PARITY_INERT, so its browser-parity hash must be falsifiable by its own body: replaying it with transitions removed must change finalGameStateHash. If this golden has genuinely become parity-inert, add it to PARITY_INERT with the reason -- never silently.`,
			).not.toBe(withBody.finalGameStateHash);
		} else {
			expect(
				withoutBody.finalGameStateHash,
				`${name} is declared PARITY_INERT (${inertReason}) but its GameState-only hash now DOES depend on its body -- good news: remove it from PARITY_INERT so the stronger check applies.`,
			).toBe(withBody.finalGameStateHash);
			// The full Node-side hash must still discriminate, or the golden
			// carries no signal at all in either leg.
			expect(
				withoutBody.finalHash,
				`${name} is parity-inert, which is tolerable ONLY because the FULL Node hash (GameState + quantised ball positions, AD-15) still depends on its body. If this also matches, the golden pins nothing about its own input.`,
			).not.toBe(withBody.finalHash);
		}
	});

	it('PARITY_INERT names only real goldens -- a renamed or removed golden must not leave a stale exemption standing', () => {
		for (const name of Object.keys(PARITY_INERT)) {
			expect(GOLDEN_NAMES as readonly string[], `PARITY_INERT entry "${name}" is not a known golden`).toContain(name);
		}
		expect(Object.keys(PARITY_INERT).length, 'sanity: if this ever empties, delete the allowlist rather than leaving an empty one').toBeGreaterThan(0);
	});
});

describe('runReplay() -- a stale header fails BEFORE hashing, naming the changed input (never silently re-records)', () => {
	// Any one golden is representative -- the header-verification logic lives
	// entirely in runReplay() itself, not per-golden.
	const golden = loadGolden('nudge-coupling');
	const collisionDoc = loadCollisionDoc();

	function replayWith(headerOverrides: Partial<ReplayHeader>) {
		const mutated: Replay = { header: { ...golden.header, ...headerOverrides }, transitions: golden.transitions };
		return () => runReplay({ replay: mutated, collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });
	}

	it('a golden whose tickHz no longer matches the live tick rate fails naming tickHz, before any hash is computed', () => {
		expect(replayWith({ tickHz: golden.header.tickHz + 1 })).toThrow(StaleReplayHeaderError);
		try {
			replayWith({ tickHz: golden.header.tickHz + 1 })();
			expect.unreachable();
		} catch (err) {
			expect(String(err)).toContain('tickHz');
		}
	});

	it('a golden whose tableHash no longer matches the live TABLE fails naming tableHash', () => {
		try {
			replayWith({ tableHash: 'deliberately-stale-table-hash' })();
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(StaleReplayHeaderError);
			expect(String(err)).toContain('tableHash');
		}
	});

	it('a golden whose assetHash no longer matches the live collision document fails naming assetHash', () => {
		try {
			replayWith({ assetHash: 'deliberately-stale-asset-hash' })();
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(StaleReplayHeaderError);
			expect(String(err)).toContain('assetHash');
		}
	});

	it('a golden whose physicsVersion no longer matches the live PHYSICS_VERSION fails naming physicsVersion', () => {
		try {
			replayWith({ physicsVersion: 'v1-deliberately-stale' })();
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(StaleReplayHeaderError);
			expect(String(err)).toContain('physicsVersion');
		}
	});

	it('a golden whose resolved tuning no longer matches the live resolveTuning() output fails naming the tuning, not the hash', () => {
		const mutatedTuning = {
			...golden.header.gameStart.tuning,
			defaultPitchDeg: { ...golden.header.gameStart.tuning.defaultPitchDeg, value: 999 },
		};
		try {
			replayWith({ gameStart: { ...golden.header.gameStart, tuning: mutatedTuning } })();
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(StaleReplayHeaderError);
			expect(String(err)).toContain('tuning');
		}
	});

	it('an UNCHANGED header replays without throwing -- the checks above are discriminating, not vacuously always-throw', () => {
		expect(replayWith({})).not.toThrow();
	});

	it('a coilPrologue entry whose tick exceeds durationTicks fails naming the tick and the valid range, before any hash is computed', () => {
		const overshootTick = golden.durationTicks + 1;
		const badPrologue: readonly CoilPrologueEntry[] = [{ tick: overshootTick, coil: 'c_trough_eject' }];
		try {
			runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: golden.durationTicks, coilPrologue: badPrologue });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(InvalidCoilPrologueError);
			expect(String(err), 'must name the offending tick').toContain(String(overshootTick));
			expect(String(err), 'must name the valid range').toContain(String(golden.durationTicks));
		}
	});

	// Review finding 2026-08-29: the coilPrologue guard above existed and
	// carried its own rationale ("an out-of-range tick would otherwise
	// silently never fire"), but the SAME hazard on transitions,
	// checkpointTicks and durationTicks was unguarded. sim/loop's
	// frameInForceAt() applies a pending transition as soon as its tick is
	// REACHED, so a tick below 1 fires earlier than the golden declares and
	// one above durationTicks never fires -- either way the recorded hash
	// stops describing the scenario the golden's own data claims.
	it('a transition whose tick exceeds durationTicks fails naming the index and the valid range, before any replay work', () => {
		const overshoot = golden.durationTicks + 1;
		const mutated: Replay = { header: golden.header, transitions: [{ tick: overshoot, frame: golden.transitions[0]!.frame }] };
		try {
			runReplay({ replay: mutated, collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(InvalidReplayRangeError);
			expect(String(err), 'must name the offending tick').toContain(String(overshoot));
			expect(String(err), 'must name transitions specifically, not the prologue').toContain('replay.transitions[0]');
		}
	});

	it('a checkpointTick outside [1, durationTicks] fails naming it, rather than being silently absent from the returned map', () => {
		try {
			runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue, checkpointTicks: [0] });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(InvalidReplayRangeError);
			expect(String(err)).toContain('checkpointTicks[0]');
		}
	});

	it('a durationTicks of 0 fails naming it, rather than hashing the un-advanced initial state as if it were a replay result', () => {
		try {
			runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: 0, coilPrologue: [] });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(InvalidReplayRangeError);
			expect(String(err)).toContain('durationTicks');
		}
	});

	it('this golden\'s OWN transitions and a checkpoint-free run pass every guard above -- they are discriminating, not vacuously always-throw', () => {
		expect(() => runReplay({ replay: toReplay(golden), collisionDoc, durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue })).not.toThrow();
	});
});

describe('canonicalize() -- non-finite and undefined values are rejected with a named path, never silently collapsed by JSON.stringify', () => {
	it('rejects a NaN at a nested path', () => {
		expect(() => canonicalize({ game: { tick: NaN } })).toThrow(NonCanonicalValueError);
		try {
			canonicalize({ game: { tick: NaN } });
			expect.unreachable();
		} catch (err) {
			expect(String(err)).toContain('game.tick');
		}
	});

	it('rejects Infinity inside an array, naming the index', () => {
		try {
			canonicalize({ balls: [{ pos: { x: Infinity, y: 0, z: 0 } } ] });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(NonCanonicalValueError);
			expect(String(err)).toContain('balls[0].pos.x');
		}
	});

	it('rejects undefined, naming the path -- JSON.stringify would otherwise silently drop the key', () => {
		try {
			canonicalize({ a: { b: undefined } });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(NonCanonicalValueError);
			expect(String(err)).toContain('a.b');
		}
	});

	it('rejects a symbol, naming the path -- JSON.stringify would otherwise silently drop the key', () => {
		try {
			canonicalize({ a: { b: Symbol('x') } });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(NonCanonicalValueError);
			expect(String(err)).toContain('a.b');
		}
	});

	it('rejects a function, naming the path -- JSON.stringify would otherwise silently drop the key', () => {
		try {
			canonicalize({ a: { b: () => 1 } });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(NonCanonicalValueError);
			expect(String(err)).toContain('a.b');
		}
	});

	it('rejects a bigint, naming the path -- JSON.stringify only throws its own generic, unnamed TypeError; this names the path first', () => {
		try {
			canonicalize({ a: { b: 1n } });
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(NonCanonicalValueError);
			expect(String(err)).toContain('a.b');
		}
	});

	it('a genuinely finite, defined tree canonicalizes without throwing, with keys sorted at every depth', () => {
		expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toEqual({ a: { c: 3, d: 2 }, b: 1 });
	});
});

describe('roll-and-drain golden: the ball genuinely returns to bd_trough', () => {
	it('a ball genuinely existed in play (the coilPrologue actually served one -- "nothing arranged" guard) before it drained, and finalSnapshot ends with zero balls, ballsInPlay 0, and a full trough', () => {
		const golden = loadGolden('roll-and-drain');
		let sawABall = false;
		const result = runReplay({
			replay: toReplay(golden),
			collisionDoc: loadCollisionDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
			onTick: (_tick, snapshot) => {
				if (snapshot.balls.length > 0) {
					sawABall = true;
				}
			},
		});
		// Guards exactly the vacuity shape this story's sweep hunts elsewhere
		// (Code Map Part D item 1, "nothing arranged"): without this, a
		// coilPrologue that failed to serve ANY ball would still pass every
		// assertion below vacuously (zero balls, ballsInPlay 0, trough full --
		// all true from the START too).
		expect(sawABall, 'the coilPrologue must have actually served a ball into play at some point -- otherwise "the ball drained" is vacuously true').toBe(true);
		expect(result.finalSnapshot.balls, 'the ball must have drained').toEqual([]);
		expect(result.finalSnapshot.game.machine.ballsInPlay, 'ballsInPlay must settle back to 0').toBe(0);
		expect(result.finalSnapshot.mechanisms.devices.bd_trough.slots, 'the drained ball must have re-filled a trough slot').toEqual([true, true, true, true]);
	});
});

describe('hold-and-release golden: the coil hardware rule genuinely energises, holds, and the ball genuinely contacts the raised bat -- within the declared prologue+transitions, never re-derived from a value this same run produced', () => {
	it('the flipper reaches end-of-stroke shortly after the press, is STILL held at the release tick, and the raised bat measurably deflects the ball (a real contact, against a no-flipper control run)', () => {
		const golden = loadGolden('hold-and-release');
		const pressTick = golden.transitions[0]!.tick; // 7300, declared in the golden's own data
		const releaseTick = golden.transitions[1]!.tick; // 8100
		const result = runReplay({
			replay: toReplay(golden),
			collisionDoc: loadCollisionDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
			checkpointTicks: [1, pressTick, pressTick + 60, releaseTick],
		});

		const atRest = result.checkpoints.get(1)!; // long before the press -- the TRUE rest angle, captured independently rather than hardcoded
		const atPress = result.checkpoints.get(pressTick)!;
		const shortlyAfterPress = result.checkpoints.get(pressTick + 60)!;
		const atRelease = result.checkpoints.get(releaseTick)!;
		expect(atRest, 'checkpoint at tick 1 must have been captured').toBeDefined();
		expect(atPress, 'checkpoint at the press tick must have been captured').toBeDefined();
		expect(shortlyAfterPress, 'checkpoint shortly after the press must have been captured').toBeDefined();
		expect(atRelease, 'checkpoint at the release tick must have been captured').toBeDefined();

		// AD-5's own t/t+1 pin, restated against THIS golden's own real ball
		// interaction (test/flipper-mover.test.ts pins the isolated mover; this
		// confirms the same shape survives full-loop integration): unchanged at
		// the press tick itself (still resting, an INDEPENDENTLY captured rest
		// angle -- never compared against a value this same tick produced),
		// moved by a handful of ticks later.
		expect(atPress.mechanisms.flippers.l.angleDeg, 'the mover must be UNCHANGED at the press tick itself, matching the independently-captured rest angle').toBe(atRest.mechanisms.flippers.l.angleDeg);
		expect(shortlyAfterPress.mechanisms.flippers.l.angleDeg, 'the mover must have reached (or be at) end-of-stroke well within 60 ticks of the press').toBeCloseTo(90, 0);
		expect(shortlyAfterPress.mechanisms.flippers.l.angleDeg, 'sanity: the mover must actually have MOVED off rest by this point').not.toBe(atRest.mechanisms.flippers.l.angleDeg);
		expect(atRelease.mechanisms.flippers.l.angleDeg, 'the flipper must STILL be held at end-of-stroke at the release tick itself -- it has not yet begun returning').toBeCloseTo(90, 0);

		// The ball genuinely contacted the raised bat -- proved against a PAIRED
		// CONTROL RUN of this identical golden with its transitions removed
		// (the same idiom test/cabinet-integration.test.ts and the DW-83 tests
		// in test/cabinet-nudge.test.ts use), never against a value this same
		// run produced.
		//
		// Review finding 2026-08-29: this block used to assert `ball.pos.z > 15`
		// ("a measurable z-height hop ... real contact, not a miss"). That
		// assertion is VACUOUS -- precisely the shape this whole story's sweep
		// exists to hunt. Measured this pass: replaying this golden with NO
		// flipper input at all still reaches z = 20.63 mm (against 19.62 mm
		// WITH the flipper), because the ball hops off the bottom wall on its
		// own; the flag was true either way and could never fail for the state
		// its own message denied. The control comparison below IS
		// discriminating: across the hold window the two trajectories diverge
		// by up to 48.30 mm (first exceeding 1 mm at tick 7394, 94 ticks after
		// the press), while the control's bat never leaves its 141 deg rest
		// angle. The 5 mm bound sits ~10x below the measured divergence and far
		// above any float noise.
		const controlPositions = new Map<number, { x: number; y: number; z: number }>();
		const controlAngles = new Map<number, number>();
		runReplay({
			replay: { header: golden.header, transitions: [] },
			collisionDoc: loadCollisionDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
			onTick: (tick, snapshot) => {
				if (tick < pressTick || tick > releaseTick) {
					return;
				}
				const ball = snapshot.balls[0];
				if (ball) {
					controlPositions.set(tick, { ...ball.pos });
				}
				controlAngles.set(tick, snapshot.mechanisms.flippers.l.angleDeg);
			},
		});

		let maxDivergenceMm = 0;
		const hopResult = runReplay({
			replay: toReplay(golden),
			collisionDoc: loadCollisionDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
			onTick: (tick, snapshot) => {
				const ball = snapshot.balls[0];
				const control = controlPositions.get(tick);
				if (ball && control) {
					const divergence = Math.hypot(ball.pos.x - control.x, ball.pos.y - control.y, ball.pos.z - control.z);
					if (divergence > maxDivergenceMm) {
						maxDivergenceMm = divergence;
					}
				}
			},
		});
		expect(hopResult.finalHash, 'sanity: the second run must reproduce the same hash as the first (determinism)').toBe(result.finalHash);
		expect(controlPositions.size, 'sanity: the control run must have had a ball in play across the hold window, or the comparison below is vacuous').toBeGreaterThan(0);
		expect(
			controlAngles.get(pressTick + 60),
			'sanity: the CONTROL run must genuinely carry no flipper input -- its bat must still sit at the independently-captured rest angle exactly where the golden\'s reached 90 deg, or the two runs are not actually different',
		).toBe(atRest.mechanisms.flippers.l.angleDeg);
		expect(
			maxDivergenceMm,
			`the raised bat must have measurably deflected the ball: the golden's trajectory must diverge from the identical no-flipper control run by more than 5 mm somewhere in the hold window (measured this pass: 48.30 mm). Observed maximum divergence: ${maxDivergenceMm.toFixed(4)} mm`,
		).toBeGreaterThan(5);
	});
});

describe('full-plunge golden: the DW-66 observable (ball_launched + ballsInPlay) and reaching the main field', () => {
	it('ball_launched fires exactly once, ballsInPlay becomes 1, and the ball crosses the plunger-lane divider onto the main field', () => {
		const golden = loadGolden('full-plunge');
		const result = runReplay({ replay: toReplay(golden), collisionDoc: loadCollisionDoc(), durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });

		const launches = result.events.filter((e) => e.type === 'ball_launched');
		expect(launches, 'ball_launched must fire exactly once (DW-66) -- if this golden\'s own coilPrologue no longer serves and launches a ball, this is 0, not 1').toHaveLength(1);
		expect(result.finalSnapshot.game.machine.ballsInPlay, 'ballsInPlay must be 1 once genuinely launched (DW-66)').toBe(1);

		// The plunger-lane divider's main-field face, table mm (same figure
		// test/machine-serve-drain.test.ts and test/plunger.test.ts already use).
		const LANE_X0_MM = 468.4;
		expect(result.finalSnapshot.balls[0]?.pos.x, 'the ball must have crossed the plunger-lane divider onto the main field by the end of the golden').toBeLessThan(LANE_X0_MM);
	});
});

describe('nudge-coupling golden: the nudge genuinely diverged the ball from where it would otherwise rest', () => {
	it('the served ball\'s final resting x differs from the un-nudged shooter-lane resting x (~497.4 mm)', () => {
		const golden = loadGolden('nudge-coupling');
		const result = runReplay({ replay: toReplay(golden), collisionDoc: loadCollisionDoc(), durationTicks: golden.durationTicks, coilPrologue: golden.coilPrologue });
		const ball = result.finalSnapshot.balls[0];
		expect(ball, 'the served ball must still exist -- if this golden\'s own coilPrologue no longer serves one, there is nothing to check the nudge against').toBeDefined();
		// 497.4 mm is bd_trough's authored eject x (device-eject-pose.test.ts) --
		// the un-nudged resting x a served, un-nudged ball settles at
		// (test/machine-serve-drain.test.ts's own bounds check). Any measurable
		// deviation is the nudge's own contribution; a real, nonzero divergence
		// (not compared against a value this same run produced).
		expect(Math.abs(ball!.pos.x - 497.4), "the nudge must have measurably moved the ball off the un-nudged resting x").toBeGreaterThan(0.01);
	});
});

describe('two-ball-collision golden: momentum transferred, no overlap, no sticking, separation never below one ball diameter -- checked at EVERY tick, not just at the end', () => {
	it('both balls survive to the end (no absorption), separation never drops below one ball diameter, and a genuine near-contact actually occurs', () => {
		const golden = loadGolden('two-ball-collision');
		const ballDiameterMm = TABLE.reference.ballMm; // 26.99 mm
		// A tolerance BELOW one full VU (0.53975 mm, the physics engine's own
		// length unit) -- tighter than the solver's own contact skin, loose
		// enough to absorb ordinary float rounding across two independently
		// summed axes.
		const toleranceMm = MM_PER_VU * 0.1;

		let minSeparationEver = Infinity;
		let minSeparationTick: number | undefined;
		let sawTwoBalls = false;
		// Momentum-transfer evidence: a REBOUND -- separation was DECREASING
		// (the balls closing) on one tick and INCREASING (separating again) on
		// the very next, WHILE close to contact distance. Two balls approaching
		// and then separating again, without ever overlapping, is only
		// possible via a real repulsive impulse at the moment of contact --
		// this is the "momentum transferred, no sticking" claim made
		// independently checkable, not merely inferred from the hash.
		let previousSeparation: number | undefined;
		let previousDelta: number | undefined;
		let sawRebound = false;
		const result = runReplay({
			replay: toReplay(golden),
			collisionDoc: loadCollisionDoc(),
			durationTicks: golden.durationTicks,
			coilPrologue: golden.coilPrologue,
			onTick: (tick, snapshot) => {
				if (snapshot.balls.length === 2) {
					sawTwoBalls = true;
					const [a, b] = snapshot.balls;
					const sep = Math.hypot(a!.pos.x - b!.pos.x, a!.pos.y - b!.pos.y, a!.pos.z - b!.pos.z);
					if (sep < minSeparationEver) {
						minSeparationEver = sep;
						minSeparationTick = tick;
					}

					if (previousSeparation !== undefined) {
						const delta = sep - previousSeparation;
						if (previousDelta !== undefined && previousDelta < 0 && delta > 0 && previousSeparation < ballDiameterMm + 1) {
							sawRebound = true;
						}
						previousDelta = delta;
					}
					previousSeparation = sep;
				}
			},
		});

		expect(sawTwoBalls, 'both balls must actually have been in play together at some tick -- if this golden\'s own coilPrologue (two eject+autolaunch pairs) no longer serves both, this proves nothing').toBe(true);
		expect(result.finalSnapshot.balls, 'both balls must survive to the end -- neither absorbed nor removed').toHaveLength(2);

		expect(
			minSeparationEver,
			`the two balls must never overlap -- minimum observed centre separation was ${minSeparationEver.toFixed(4)} mm at tick ${minSeparationTick} against a ball diameter of ${ballDiameterMm} mm`,
		).toBeGreaterThanOrEqual(ballDiameterMm - toleranceMm);
		expect(
			minSeparationEver,
			'sanity: the balls must have actually come close to touching at some point, or "never overlaps" is vacuously true for two balls that never met',
		).toBeLessThan(ballDiameterMm + 5);
		expect(
			sawRebound,
			'momentum must genuinely have been transferred: the separation must have DECREASED (closing) then INCREASED (separating) again near contact distance, in consecutive ticks -- a real repulsive impulse, not merely two paths that happened to stay apart',
		).toBe(true);
	});
});
