// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.8 QA pass -- src/sim/loop/replay.ts ships AD-15's state hash
// verbatim ("FNV-1a over canonical JSON of GameState plus ball positions
// quantised to 0.01 mm"). test/loop-determinism.test.ts and
// test/replay-goldens.test.ts already exercise this hash through full
// createLoop()/runReplay() integration runs and through canonicalize()'s
// non-finite/undefined rejection paths -- but nothing directly pins three
// properties the hash's own job description requires:
//
//   1. ORDER-INDEPENDENCE: "canonical JSON" means two logically identical
//      GameState trees, built with object keys inserted in a DIFFERENT
//      order (e.g. by two different code paths that happen to construct or
//      spread properties differently), must hash IDENTICALLY -- while a
//      genuine difference in ARRAY element order (which IS semantically
//      meaningful, e.g. ball identity/order) must still be told apart.
//   2. QUANTISATION BOUNDARY STABILITY: two ball positions that differ only
//      by sub-0.01mm floating-point jitter (the exact noise real physics
//      integration produces between "the same" run twice) must hash
//      IDENTICALLY, while two positions that genuinely straddle a 0.01mm
//      boundary must hash DIFFERENTLY -- proving quantize001Mm() is
//      actually wired into stateHash() and is not a no-op.
//   3. DISCRIMINATING POWER: two otherwise-identical states that differ in
//      exactly one field (tick, a device slot, a ball position) must
//      produce DIFFERENT hashes -- the minimum bar for a hash to be useful
//      at all, and the one every golden's own correctness depends on
//      entirely.
//
// A hash that fails any of these three either produces spurious CI failures
// (order-sensitivity) or -- far worse -- silently accepts a real regression
// (quantisation bypassed, or two genuinely different states colliding).

import { describe, expect, it } from 'vitest';
import { canonicalize, fnv1aHex, gameStateHash, quantize001Mm, stateHash } from '../src/sim/loop/replay';
import type { GameState, MachineState } from '../src/sim/table/names';
import type { BallSnapshot } from '../src/sim/contracts/snapshot';

function machine(overrides: Partial<MachineState> = {}): MachineState {
	return {
		ballsInPlay: 0,
		hardwareEnabled: true,
		ballSave: { untilTick: null, sources: [] },
		tilt: { tilted: false, slamTilted: false },
		multiball: null,
		highscores: [],
		deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false] },
		...overrides,
	};
}

function state(overrides: Partial<GameState> = {}): GameState {
	return {
		tick: 0,
		phase: 'attract',
		machine: machine(),
		players: [],
		currentPlayer: 0,
		modes: [],
		rng: 0,
		...overrides,
	};
}

function ball(id: number, x: number, y: number, z: number): BallSnapshot {
	return { id, pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, speed: 0 };
}

describe('src/sim/loop/replay.ts -- canonicalize() is genuinely order-independent for object keys', () => {
	it('two GameState trees built with DIFFERENT object-key insertion order hash identically', () => {
		// The SAME values, but each nested object literal below is written with
		// its keys in a DIFFERENT order than its sibling -- not artificial: two
		// different code paths (e.g. a fresh construction vs. a `{ ...prev,
		// field: x }` spread) commonly produce exactly this kind of divergence
		// in real V8 property-insertion order.
		const a: GameState = {
			tick: 42,
			phase: 'game',
			currentPlayer: 0,
			machine: {
				ballsInPlay: 1,
				hardwareEnabled: true,
				ballSave: { untilTick: null, sources: [] },
				tilt: { tilted: false, slamTilted: false },
				multiball: null,
				highscores: [],
				deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false] },
			},
			players: [],
			modes: [],
			rng: 7,
		};
		const b: GameState = {
			rng: 7,
			modes: [],
			players: [],
			machine: {
				deviceSlots: { bd_shooter: [false], bd_trough: [true, true, true, false] },
				highscores: [],
				multiball: null,
				tilt: { slamTilted: false, tilted: false },
				ballSave: { sources: [], untilTick: null },
				hardwareEnabled: true,
				ballsInPlay: 1,
			},
			currentPlayer: 0,
			phase: 'game',
			tick: 42,
		};

		expect(a, 'sanity: a and b must be deep-equal in content, or this test proves nothing about order').toEqual(b);
		expect(JSON.stringify(canonicalize(a))).toBe(JSON.stringify(canonicalize(b)));
		expect(stateHash(a, []), 'stateHash() must be insensitive to object-key insertion order').toBe(stateHash(b, []));
		expect(gameStateHash(a)).toBe(gameStateHash(b));
	});

	it('order-independence holds at EVERY nesting depth, not just the top level', () => {
		const deepA = canonicalize({ x: { c: { z: 1, y: 2 }, a: 3 }, b: 4 });
		const deepB = canonicalize({ b: 4, x: { a: 3, c: { y: 2, z: 1 } } });
		expect(JSON.stringify(deepA)).toBe(JSON.stringify(deepB));
	});

	it('array ELEMENT order is NEVER reordered -- canonicalize() sorts object keys only, so a genuine array-order difference is still told apart', () => {
		// Guards the opposite failure mode: an over-eager canonicaliser that
		// also sorted arrays would erase a real semantic difference (e.g. two
		// balls swapping identity, or a device's slot fill order).
		const orderA = canonicalize({ balls: [{ id: 1 }, { id: 2 }] });
		const orderB = canonicalize({ balls: [{ id: 2 }, { id: 1 }] });
		expect(JSON.stringify(orderA)).not.toBe(JSON.stringify(orderB));
	});
});

describe('src/sim/loop/replay.ts -- quantize001Mm() boundary behaviour is stable and wired into stateHash()', () => {
	it('is idempotent -- quantising an already-quantised value never drifts further', () => {
		for (const raw of [0, 0.005, 12.344999999, 12.345000001, -0.015, 497.4, 1000.005]) {
			const once = quantize001Mm(raw);
			const twice = quantize001Mm(once);
			expect(twice, `quantize001Mm(quantize001Mm(${raw})) must equal quantize001Mm(${raw})`).toBe(once);
		}
	});

	it('two ball positions on the SAME side of a 0.01mm bucket (sub-quantisation float jitter) hash IDENTICALLY', () => {
		// 12.3444999 mm and 12.3449999 mm are both inside the [12.34, 12.35)
		// bucket below the 12.345 boundary -- exactly the sub-hundredth-mm
		// jitter real physics integration produces between two runs that are
		// "the same" up to float noise. Without stateHash() actually applying
		// quantize001Mm() to each axis, these would hash DIFFERENTLY --
		// JSON.stringify does not truncate float precision on its own.
		const g = state();
		const jitterLow = stateHash(g, [ball(1, 12.3444999, 0, 0)]);
		const jitterHigh = stateHash(g, [ball(1, 12.3449999, 0, 0)]);
		expect(jitterLow, 'sub-quantisation jitter on the SAME side of the bucket boundary must hash identically').toBe(jitterHigh);
	});

	it('two ball positions that genuinely STRADDLE a 0.01mm boundary hash DIFFERENTLY -- quantisation absorbs noise, it does not erase real differences', () => {
		const g = state();
		const justBelow = stateHash(g, [ball(1, 12.344999999, 0, 0)]); // quantises to 12.34
		const justAbove = stateHash(g, [ball(1, 12.345000001, 0, 0)]); // quantises to 12.35
		expect(quantize001Mm(12.344999999), 'sanity: these two raw inputs must actually land in different buckets, or this test proves nothing').not.toBe(quantize001Mm(12.345000001));
		expect(justBelow, 'positions straddling the quantisation boundary must produce genuinely different hashes').not.toBe(justAbove);
	});
});

describe('src/sim/loop/replay.ts -- stateHash()/gameStateHash() have genuine discriminating power', () => {
	it('a one-field difference in GameState (tick) changes both hashes', () => {
		expect(stateHash(state({ tick: 1 }), [])).not.toBe(stateHash(state({ tick: 2 }), []));
		expect(gameStateHash(state({ tick: 1 }))).not.toBe(gameStateHash(state({ tick: 2 })));
	});

	it('a one-field difference deep inside machine.deviceSlots changes the hash', () => {
		const s1 = state({ machine: machine({ deviceSlots: { bd_trough: [true, true, true, true], bd_shooter: [false] } }) });
		const s2 = state({ machine: machine({ deviceSlots: { bd_trough: [true, true, true, false], bd_shooter: [false] } }) });
		expect(stateHash(s1, [])).not.toBe(stateHash(s2, []));
	});

	it('a measurable ball-position difference (1mm, well above quantisation resolution) changes the full state hash', () => {
		const g = state();
		const near = stateHash(g, [ball(1, 100, 200, 13.5)]);
		const far = stateHash(g, [ball(1, 101, 200, 13.5)]);
		expect(near, 'a real, 1mm ball-position difference must change the full state hash').not.toBe(far);
	});

	it('two structurally identical, freshly-constructed states with NO shared object references still hash identically -- proves the hash is content-based, not reference/identity-based', () => {
		const s1 = state({ tick: 99 });
		const s2 = state({ tick: 99 });
		expect(s1, 'sanity: these must be genuinely different object instances').not.toBe(s2);
		expect(stateHash(s1, [ball(1, 5, 5, 5)])).toBe(stateHash(s2, [ball(1, 5, 5, 5)]));
	});
});

describe('src/sim/loop/replay.ts -- fnv1aHex() is a real hash, not a constant', () => {
	it('different inputs produce different digests; the same input reproduces the same digest; the empty string reduces to the bare FNV-1a basis', () => {
		expect(fnv1aHex('a')).not.toBe(fnv1aHex('b'));
		expect(fnv1aHex('hello world')).toBe(fnv1aHex('hello world'));
		// AD-15's own definition, verbatim: basis 0x811c9dc5. The empty string
		// never enters the mixing loop, so it must reduce to exactly the basis,
		// hex-encoded and NOT zero-padded -- computed here from the same basis
		// constant the spec names, independently of calling fnv1aHex() again.
		expect(fnv1aHex('')).toBe((0x811c9dc5 >>> 0).toString(16));
	});
});
