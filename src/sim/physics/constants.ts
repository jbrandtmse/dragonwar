/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */
// Ported from vpdb/vpx-js (GPL-2.0-or-later); distributed with DragonWar under GPL-3.0
// Source: lib/physics/constants.ts
// Note: the upstream file at this path carried no licence header of its own; the
// canonical vpx-js GPL-2.0-or-later header above (copied unchanged from
// lib/physics/hit-object.ts) is attached per CLAUDE.md's provenance rule, since the
// licence for this file was established from the repository's other header-bearing
// source files rather than from the file itself. See ATTRIBUTIONS.md and the
// deviation list in docs/spikes/spike-1.md.
//
// AD-15: every value below is transcribed verbatim from the pinned upstream source
// and is never tunable. Do not hand-tune these; changing one is a physics-version
// bump that re-records every golden replay.

export const PHYSICS_STEPTIME = 1000;         // usecs to go between each physics update

export const PHYSICS_STEPTIME_S = (PHYSICS_STEPTIME * 1e-6);     // step time in seconds

export const DEFAULT_STEPTIME = 10000;     // default physics rate: 1000Hz
export const DEFAULT_STEPTIME_S = 0.01;      // default physics rate: 1000Hz

export const PHYS_FACTOR = (PHYSICS_STEPTIME_S / DEFAULT_STEPTIME_S);

export const DEFAULT_TABLE_GRAVITY = 0.97;
export const DEFAULT_TABLE_CONTACTFRICTION = 0.075;
export const DEFAULT_TABLE_SCATTERANGLE = 0.5;
export const DEFAULT_TABLE_ELASTICITY = 0.25;
export const DEFAULT_TABLE_ELASTICITY_FALLOFF = 0;
export const DEFAULT_TABLE_PFSCATTERANGLE = 0;
export const DEFAULT_TABLE_MIN_SLOPE = 6.0;
export const DEFAULT_TABLE_MAX_SLOPE = 6.0;

export const HIT_SHAPE_DETAIL_LEVEL = 7.0; // static detail level to approximate ramps and rubbers for the physics/collision code

export const MAX_REELS = 32;

/*
 * NOTE ABOUT VP PHYSICAL UNITS:
 *
 * By convention, one VP length unit (U) corresponds to
 *   1 U = .53975 mm = 5.3975E-4 m,   or   1 m = 1852.71 U
 *
 * For historical reasons, one VP time unit (T) corresponds to
 *   1 T = 10 ms = 0.01 s,            or   1 s = 100 T
 *
 * Therefore, Earth gravity in VP units can be computed as
 *   g  =  9.81 m/s^2  =  1.81751 U/T^2
 */

export const GRAVITYCONST = 1.81751;

// Collisions:
//
// test near zero conditions in linear, well behaved, conditions
export const C_PRECISION = 0.01;
// tolerance for line segment endpoint and point radii collisions
export const C_TOL_ENDPNTS = 0.0;
export const C_TOL_RADIUS = 0.005;
// Physical Skin ... postive contact layer. Any contact (collision) in this layer reports zero time.
// layer is used to calculate contact effects ... beyond this and objects pass through each other
// Default 25.0
export const PHYS_SKIN = 25.0; //!! seems like this mimics the radius of the ball -> replace with radius where possible?
// Layer outside object which increases it's size for contact measurements. Used to determine clearances.
// Setting this value during testing to 0.1 will insure clearance. After testing set the value to 0.005
// Default 0.01
export const PHYS_TOUCH = 0.05;
// Low Normal speed collison is handled as contact process rather than impulse collision
export const C_LOWNORMVEL = 0.0001;
export const C_CONTACTVEL = 0.099;

//export const NEW_PHYSICS

// low velocity stabilization ... if embedding occurs add some velocity
export const C_EMBEDVELLIMIT = 5;

// old workarounds, not needed anymore?!
export const C_EMBEDSHOT_PLANE = 0; // push pos up if ball embedded in plane
export const C_EMBEDDED = 0.0;
export const C_EMBEDSHOT = 0.05;
// Contact displacement corrections, hard ridgid contacts i.e. steel on hard plastic or hard wood
export const C_DISP_GAIN = 0.9875;
export const C_DISP_LIMIT = 5.0;
// Have special cases for balls that are determined static? (C_DYNAMIC is kind of a counter for detection) -> does not work stable enough anymore nowadays
//export const C_DYNAMIC 2
// choose only one of these two heuristics:
export const C_BALL_SPIN_HACK = 0; // original ball spin reduction code, based on automatic detection/heuristic of resting balls

//trigger/kicker boundary crossing hysterisis
export const STATICTIME = 0.005;
export const STATICCNTS = 10;

//Flippers:
export const C_INTERATIONS = 20; // Precision level and cycles for interative calculations // acceptable contact time ... near zero time

//Plumb:
export const VELOCITY_EPSILON = 0.05;	// The threshold for zero velocity.

export const JOYRANGEMN  = -65536;
export const JOYRANGEMX = 65536;

// Deviation: relocated from `lib/vpt/ball/ball-hit.ts:303`, where it was a bare
// literal inside the impulse formula (`-(1.0 + 0.8) * dot / (...)`). Extracted here
// as a named, verbatim, never-tunable solver constant per AD-15 and this story's task
// list ("Extract the hardcoded 0.8 ball-ball restitution into constants.ts").
export const BALL_BALL_RESTITUTION = 0.8; // lib/vpt/ball/ball-hit.ts:303

// Deviation: relocated from upstream's `lib/vpt/mesh.ts:27-28` (a mesh-authoring file
// that is out of scope, AD-1). Both math/vertex3d.ts and math/frect3d.ts need these.
export const FLT_MIN = 1.175494350822287507968736537222245677819e-038;
export const FLT_MAX = 340282346638528859811704183484516925440;
