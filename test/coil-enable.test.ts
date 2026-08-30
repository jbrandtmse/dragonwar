// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// DW-74: AD-5 says every hardware coil is "gated only by CoilCommand enable |
// disable" -- `src/sim/physics/machine.ts`'s `coilEnabled` map (:185-190) is
// written by every enable/disable command but was never CONSULTED on the
// pulse path: `deviceMechanics.applyCommands()` (`devices.ts`) takes no
// enabled parameter at all, so a disabled `c_trough_eject` or `c_autolaunch`
// coil still fired exactly as if it were enabled. The manual-plunge path
// already gated correctly (`plunger.ts:86-88`, `if (!enabled) return
// EMPTY_RESULT;`) -- this closed the gap between the two, per the ledger's
// own two options: "gate applyCommands on the map" (chosen) vs "drop the two
// unread keys".
//
// Driven through the real `createLoop()`, matching `test/plunger.test.ts`'s
// own `setCoilEnabled`/`pulseCoil` coverage style -- the public seam a real
// host (or a replay) uses, never `machine.ts`'s internals directly.
//
// Falsifiability (Rule 19): mutation: remove the `coilEnabled` filter in
// `machine.ts` and pass `pulses` unfiltered to
// `deviceMechanics.applyCommands()` -> the `c_trough_eject` swallowed-pulse
// assertion and the `c_autolaunch` parity assertion both go red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLoop, NO_FRAME } from '../src/sim/loop';
import { resolveTuning } from '../src/sim/table/tuning';

const COLLISION_PATH = path.resolve(__dirname, '..', 'public', 'assets', 'dragonwar.collision.json');

function loadDoc(): unknown {
	return JSON.parse(readFileSync(COLLISION_PATH, 'utf8'));
}

/** Serves a ball into the shooter lane and lets it settle -- the same sequence test/plunger.test.ts's own helper uses. */
function serveAndSettle(loop: ReturnType<typeof createLoop>) {
	loop.pulseCoil('c_trough_eject');
	let out = loop.advance(20, []);
	for (let i = 0; i < 300; i++) {
		out = loop.advance(16.667, []);
	}
	return out;
}

function countBallLaunched(events: readonly unknown[]): number {
	return events.filter((e) => (e as { type: string }).type === 'ball_launched').length;
}

function countEjectContacts(contactEvents: readonly unknown[]): number {
	return contactEvents.filter((e) => (e as { kind: string }).kind === 'eject').length;
}

describe('sim/physics/machine.ts -- the coilEnabled map gates the pulse path too (DW-74, AD-5)', () => {
	it('c_trough_eject disabled: pulseCoil swallows the pulse -- no ball ejected, no slot switch opens, no eject contact event', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		loop.setCoilEnabled('c_trough_eject', false);
		let out = loop.advance(1, []); // the disable lands this tick
		const beforeSlots = out.snapshot.game.machine.deviceSlots.bd_trough;

		loop.pulseCoil('c_trough_eject');
		out = loop.advance(1, []);

		expect(out.snapshot.balls, 'a disabled coil must eject no ball').toEqual([]);
		expect(out.snapshot.game.machine.deviceSlots.bd_trough, 'the trough slot occupancy must be untouched -- no slot switch opens').toEqual(beforeSlots);
		expect(countEjectContacts(out.contactEvents), 'no eject contact event').toBe(0);
		expect(out.events.some((e) => (e as { type: string }).type === 'eject_failed'), 'silence, not a failure event: a disabled coil never even reaches devices.ts, so it cannot fail there either').toBe(false);

		// Sanity: re-enabling restores the eject, or "disabled swallows it"
		// could just as well describe a coil that never fires at all.
		loop.setCoilEnabled('c_trough_eject', true);
		out = loop.advance(1, []);
		loop.pulseCoil('c_trough_eject');
		out = loop.advance(1, []);
		expect(out.snapshot.balls, 're-enabling the coil must restore the eject').toHaveLength(1);
	});

	it('same-tick disable-then-pulse: a disable and a pulse for the SAME coil, queued for the SAME upcoming tick, is swallowed regardless of the commands array\'s own order -- every enable/disable in a tick writes the map before any pulse is filtered', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		// setCoilEnabled() and pulseCoil() both push into the SAME
		// pendingCommands queue (sim/loop/index.ts), consumed together on the
		// very next advance() -- this genuinely lands both on one tick.
		loop.setCoilEnabled('c_trough_eject', false);
		loop.pulseCoil('c_trough_eject');
		const out = loop.advance(1, []);

		expect(out.snapshot.balls, 'a same-tick disable must still win over a same-tick pulse').toEqual([]);
		expect(countEjectContacts(out.contactEvents)).toBe(0);
	});

	it('c_autolaunch disabled: a manual plunge (held-and-released) and a pulseCoil are BOTH suppressed IDENTICALLY -- no ball_launched from either, ball speed unchanged; re-enabling restores both', () => {
		const loop = createLoop({ collisionDoc: loadDoc() });
		let out = serveAndSettle(loop);
		const servedBall = out.snapshot.balls[0];
		expect(servedBall, 'sanity: the served ball must be resting before the disable, or nothing below proves anything').toBeDefined();
		const restingSpeed = servedBall!.speed;

		loop.setCoilEnabled('c_autolaunch', false);
		out = loop.advance(1, []); // the disable lands this tick

		// Manual plunge: held for a mapped, in-band duration, then released.
		const holdTicks = 250;
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: { ...NO_FRAME, plunger: true } }]);
		for (let i = 0; i < holdTicks - 1; i++) {
			out = loop.advance(1, []);
		}
		out = loop.advance(1, [{ tick: out.snapshot.tick + 1, frame: NO_FRAME }]);

		let launchedAfterManual = 0;
		for (let i = 0; i < 40; i++) {
			out = loop.advance(1, []);
			launchedAfterManual += countBallLaunched(out.events);
		}
		expect(launchedAfterManual, 'a disabled coil must suppress the manual plunge exactly as the coil pulse below').toBe(0);
		expect(out.snapshot.balls[0]!.speed, 'the ball must still be at rest, not launched').toBeLessThan(50);

		// Coil pulse: suppressed identically.
		loop.pulseCoil('c_autolaunch');
		let launchedAfterPulse = 0;
		for (let i = 0; i < 5; i++) {
			out = loop.advance(1, []);
			launchedAfterPulse += countBallLaunched(out.events);
		}
		expect(launchedAfterPulse, 'a disabled coil must suppress a direct pulseCoil() identically to the manual plunge above').toBe(0);
		expect(out.snapshot.balls[0]!.speed).toBeLessThan(50);

		// Re-enable: the coil pulse now launches, restoring parity with the
		// enabled-coil behaviour test/plunger.test.ts's own suite already pins.
		loop.setCoilEnabled('c_autolaunch', true);
		out = loop.advance(1, []);
		loop.pulseCoil('c_autolaunch');
		let launchedAfterReenable = 0;
		for (let i = 0; i < 40; i++) {
			out = loop.advance(1, []);
			launchedAfterReenable += countBallLaunched(out.events);
		}
		expect(launchedAfterReenable, 're-enabling must restore the coil pulse launch').toBe(1);

		// devices.ts's non-parking branch launches a coil pulse at
		// tuning.autolaunchSpeedMmPerS.value (AD-6: shares launch() with the
		// manual plunge, but a coil pulse supplies this fixed speed, not a
		// hold-time mapping) -- banded, not exact, the same tolerance
		// test/plunger.test.ts's own speed checks use.
		const tuning = resolveTuning();
		const expectedSpeed = tuning.autolaunchSpeedMmPerS.value;
		expect(out.snapshot.balls[0]!.speed).toBeGreaterThan(expectedSpeed * 0.7);
		expect(out.snapshot.balls[0]!.speed).toBeLessThan(expectedSpeed * 1.3);
	});
});
