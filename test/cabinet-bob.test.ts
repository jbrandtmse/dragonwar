// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Story 1.7's AC 3 (`s_tilt_bob` closes as one edge and opens as one edge)
// and AC 4 (the bob decays physically; no command resets it), plus their
// mutations. Drives `createCabinetMechanics()` directly (`PlayerPhysics`
// with no balls -- this file never touches ball coupling, AC 1's own test)
// for AC 3, and the full `createMachine()` for AC 4 (which needs a real
// `CoilCommand` to issue against a real seam).
//
// Hazard 3 (this story's spec, Design Notes): the literal K below was
// MEASURED against this implementation, not invented -- a 200-consecutive-
// tick hold is not reachable under the ported ring-clamp model (see the
// spec). K is the longest consecutive-tick run of `isOverThreshold`
// observed for the specific nudge burst this file arranges.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PlayerPhysics } from '../src/sim/physics/game/player-physics';
import { createCabinetMechanics } from '../src/sim/physics/cabinet';
import { createMachine } from '../src/sim/physics/machine';
import { NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';
import type { InputFrame } from '../src/sim/contracts/input';
import type { CoilCommand } from '../src/sim/table/names';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Ten `nudge_up` rising edges, the fastest achievable spacing via a real true/false toggle each tick (an aggressive, "slam"-style burst -- AC 3's own arrange freedom; a single ordinary nudge stays well clear of the threshold, see test/cabinet-nudge.test.ts's own measurements and this story's tuning `source` strings). Ticks 1, 3, 5, ..., 19. */
function burstFrames(): Map<number, InputFrame> {
	const frames = new Map<number, InputFrame>();
	for (let i = 0; i < 10; i++) {
		const onTick = 1 + i * 2;
		frames.set(onTick, { ...NO_FRAME, nudge_up: true });
		frames.set(onTick + 1, NO_FRAME);
	}
	return frames;
}

describe('sim/physics/cabinet -- AC 3: s_tilt_bob closes as one edge and opens as one edge', () => {
	function runBurst(totalTicks: number) {
		const physics = new PlayerPhysics();
		const tuning = resolveTuning();
		const cabinetMechanics = createCabinetMechanics({ physics, tuning });
		const frames = burstFrames();

		const levels: boolean[] = [];
		const emittedEdges: Array<{ closed: boolean; tick: number }> = [];
		for (let tick = 1; tick <= totalTicks; tick++) {
			const frame = frames.get(tick) ?? NO_FRAME;
			const result = cabinetMechanics.applyFrame(tick, frame);
			levels.push(cabinetMechanics.state.bob.isOverThreshold);
			for (const edge of result.switchEvents) {
				if (edge.switch === 's_tilt_bob') {
					emittedEdges.push({ closed: edge.closed, tick: edge.tick });
				}
			}
		}
		return { levels, emittedEdges };
	}

	/** Derives the edge sequence a correct edge-collapser (settleTicks 0) must produce from a raw per-tick level series -- the independent oracle this test checks the real emitter against. */
	function edgesFromLevels(levels: readonly boolean[]): Array<{ closed: boolean; tick: number }> {
		const edges: Array<{ closed: boolean; tick: number }> = [];
		let previous = false;
		for (let i = 0; i < levels.length; i++) {
			if (levels[i] !== previous) {
				edges.push({ closed: levels[i], tick: i + 1 });
				previous = levels[i];
			}
		}
		return edges;
	}

	function longestRun(levels: readonly boolean[]): number {
		let longest = 0;
		let current = 0;
		for (const level of levels) {
			current = level ? current + 1 : 0;
			longest = Math.max(longest, current);
		}
		return longest;
	}

	it('the emitted edge sequence equals the edge sequence derived from the level series, strictly alternates starting closed:true over the WHOLE recorded run, and SOME closed:true/closed:false pair brackets a run of K >= 10 ticks (K measured and pinned)', () => {
		// Measured finding (recorded in the spec): with this burst, the bob
		// crosses threshold repeatedly over the whole run (the cabinet's own
		// 5.8 Hz Y-axis oscillator keeps ringing for hundreds of ticks after
		// the burst, per Hazard 3's own reasoning), and the LONGEST run is not
		// always the very FIRST one -- a later crossing, still fed by the
		// cabinet's residual ringing, is bigger. The behavioural claim this AC
		// actually protects -- "one edge in, one edge out, never one per
		// tick", proven below over the ENTIRE sequence, not just one pair --
		// is unaffected by which pair happens to be the longest.
		const { levels, emittedEdges } = runBurst(1500);
		const expectedEdges = edgesFromLevels(levels);

		// (b) ordered equality against the independently-derived oracle.
		expect(emittedEdges).toEqual(expectedEdges);

		// (c) strict alternation, starting closed:true -- over EVERY pair in
		// the whole recorded run (this is what the "edge on every tick"
		// mutation breaks: it turns this into repeated closed:true,closed:true
		// non-alternation immediately).
		expect(expectedEdges.length, 'the burst must actually cross the threshold at least once, or this test proves nothing').toBeGreaterThan(0);
		expect(expectedEdges[0]!.closed, 'the sequence must begin closed:true').toBe(true);
		for (let i = 1; i < expectedEdges.length; i++) {
			expect(expectedEdges[i]!.closed, `edge ${i} must alternate polarity from edge ${i - 1}`).toBe(!expectedEdges[i - 1]!.closed);
		}

		// (a)+(d): K -- the MEASURED literal (the longest consecutive-high run
		// across the whole recording), pinned so a regression that collapses
		// every hold to a single tick (or widens one back toward the
		// unreachable 200) cannot pass silently.
		const K = longestRun(levels);
		const MEASURED_K = 15;
		expect(K, 'K must be measured and pinned, not re-derived from a live run every time (that would defeat the point of a literal)').toBe(MEASURED_K);
		expect(K, "AC 3's own bound").toBeGreaterThanOrEqual(10);

		// SOME closed:true/closed:false pair brackets exactly that K-tick run
		// -- never one tick per edge, which is what the mutation breaks.
		const runLengths: number[] = [];
		for (let i = 0; i + 1 < expectedEdges.length; i += 2) {
			runLengths.push(expectedEdges[i + 1]!.tick - expectedEdges[i]!.tick);
		}
		expect(runLengths, 'some pair must bracket exactly the K-tick run').toContain(K);
	});
});

describe('sim/physics/cabinet -- AC 4: the bob decays physically; no command resets it', () => {
	function runMachine(totalTicks: number, commandsAt: ReadonlyMap<number, readonly CoilCommand[]>) {
		const tuning = resolveTuning();
		const machine = createMachine(loadDoc(), tuning);
		const frames = burstFrames();
		const positions: Array<{ x: number; y: number; z: number }> = [];
		const omegas: Array<{ x: number; y: number; z: number }> = [];
		const angleDeg: number[] = [];
		const overThreshold: boolean[] = [];
		for (let tick = 1; tick <= totalTicks; tick++) {
			const frame = frames.get(tick) ?? NO_FRAME;
			const commands = commandsAt.get(tick) ?? [];
			machine.step(tick, frame, commands);
			const bob = machine.cabinet.bob;
			positions.push({ ...bob.positionM });
			omegas.push({ ...bob.angularVelocityRadPerS });
			angleDeg.push((bob.angleFromVerticalRad * 180) / Math.PI);
			overThreshold.push(bob.isOverThreshold);
		}
		return { positions, omegas, angleDeg, overThreshold };
	}

	it('a CoilCommand (enable, disable, pulse -- each exercised, on a later tick) never changes the bob\'s per-tick position/angular-velocity sequence (AD-7: "the bob is never reset by command")', () => {
		const noCommands = runMachine(2000, new Map());
		const withCommands = runMachine(
			2000,
			new Map<number, CoilCommand[]>([
				[100, [{ type: 'coil', coil: 'c_flipper_l', action: 'enable', tick: 100 }]],
				[150, [{ type: 'coil', coil: 'c_flipper_l', action: 'disable', tick: 150 }]],
				[200, [{ type: 'coil', coil: 'c_trough_eject', action: 'pulse', tick: 200 }]],
			]),
		);
		expect(withCommands.positions).toEqual(noCommands.positions);
		expect(withCommands.omegas).toEqual(noCommands.omegas);
		// Sanity: the bob actually moved, or this proves nothing.
		expect(noCommands.positions.some((p) => p.x !== 0 || p.y !== 0)).toBe(true);
	});

	it('each successive swing peak is strictly smaller than the previous one, and within a stated tick budget the bob is below threshold and stays there -- with no external reset of any kind', () => {
		const { angleDeg, overThreshold } = runMachine(8000, new Map());

		// "Each successive SWING" -- one full pendulum period (~634 ticks,
		// measured: a 0.10 m rod's own period, 2*pi*sqrt(L/g) ~= 634 ticks at
		// TICK_HZ 1000), not every local wiggle: while the bob is still over
		// (or near) threshold, the ring-clamp bounce repeatedly truncates and
		// redirects its swing (this story's own Hazard 3), and the cabinet's
		// still-ringing 5.8 Hz Y-axis oscillator rides a faster ripple on top
		// of the slower pendulum envelope -- so raw local maxima are NOT
		// monotonic tick to tick in that region (a real, physical beating
		// pattern, confirmed by inspecting the raw trace during this story's
		// implementation, not a bug). Once free of BOTH effects (measured:
		// past tick 1400, where the bob has settled below threshold -- see
		// SETTLE_BY_TICK below), the OUTER envelope -- the max within each
		// successive FULL-period window -- decays cleanly and monotonically,
		// which is what "each successive swing's peak angle" means physically
		// for a damped pendulum once it is genuinely free-swinging.
		const FREE_SWING_FROM_TICK = 1400;
		const PERIOD_TICKS = 634;
		const peaks: number[] = [];
		for (let windowStart = FREE_SWING_FROM_TICK; windowStart < angleDeg.length; windowStart += PERIOD_TICKS) {
			const window = angleDeg.slice(windowStart, windowStart + PERIOD_TICKS);
			if (window.length === 0) continue;
			peaks.push(Math.max(...window));
		}
		expect(peaks.length, 'the free swing must produce multiple measurable peaks, or decay cannot be observed').toBeGreaterThan(3);
		for (let i = 1; i < peaks.length; i++) {
			expect(peaks[i]!, `swing ${i} (${peaks[i]}) must be strictly smaller than swing ${i - 1} (${peaks[i - 1]})`).toBeLessThan(peaks[i - 1]!);
		}

		// MEASURED tick budget: by this tick the bob is below threshold and
		// never crosses again for the remainder of the recorded run.
		const SETTLE_BY_TICK = 1500;
		let lastOverTick = -1;
		for (let i = 0; i < overThreshold.length; i++) {
			if (overThreshold[i]) lastOverTick = i + 1;
		}
		// Code review 2026-08-29: `lastOverTick` starts at -1, so WITHOUT this
		// guard a bob that never crossed the threshold at all would leave it
		// at -1 and satisfy `toBeLessThan(SETTLE_BY_TICK)` vacuously -- "it
		// settled" would be proven by "it never moved". The crossing must be
		// asserted before the settling can mean anything.
		expect(lastOverTick, 'the burst must actually drive the bob OVER the threshold, or "it settles below threshold" proves nothing').toBeGreaterThan(0);
		expect(lastOverTick, `the bob must permanently settle below threshold by tick ${SETTLE_BY_TICK} (measured last crossing: ${lastOverTick})`).toBeLessThan(SETTLE_BY_TICK);
		for (let i = SETTLE_BY_TICK; i < overThreshold.length; i++) {
			expect(overThreshold[i], `tick ${i + 1}: must stay below threshold once settled`).toBe(false);
		}
		// s_tilt_bob re-opens (closed:false) with no external reset -- the
		// isOverThreshold level itself IS the source AC 3's edge-collapser
		// reads, so a true->false transition in that level IS the re-opening.
		// Code review 2026-08-29: this previously asserted `overThreshold[0]`
		// -- the level on tick 1, before the burst had done anything, which is
		// false by construction and said nothing about re-opening. The real
		// claim is the transition: over threshold at some point, below it at
		// the end, with no reset of any kind having been issued.
		expect(overThreshold[lastOverTick - 1], `tick ${lastOverTick}: the bob's last recorded crossing must genuinely be over threshold`).toBe(true);
		expect(overThreshold[overThreshold.length - 1], 'the bob must have re-opened by the end of the run -- its physical decay is the only settle').toBe(false);
	});
});
