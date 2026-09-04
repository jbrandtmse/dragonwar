# DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
#
# Story 1.4 -- the ONLY sanctioned edit point for assets/src/dragonwar.blend.
# Run headlessly through Blender 5.2+ every time the geometry changes:
#
#   blender --background --factory-startup --python tools/make-placeholder-blend.py
#
# Corrected 2026-08-31 (Story 2.1b, task 1): this header used to call itself
# a "ONE-TIME seeding script", claiming the `.blend` becomes the sole source
# of truth once committed and gets edited directly in Blender's UI from then
# on. Git history already contradicted that the moment it was written --
# every commit that ever changed the `.blend` also changed this script, in
# lockstep (`424c0b8`, `a93d375`, `da129bf`, `494113f`, `046af7a`, `0ae3eed`,
# and every Story 2.1a/2.1b commit since) -- and AD-11's own rule ("Blender
# owns placement... the export script is the contract's enforcer") never
# said "until Epic 2". The `.blend` is a generated BINARY: it has no
# reviewable diff, so this script is the actual, permanent, reviewable
# record of every position, mesh and switch zone the table carries. The
# correct workflow is, and has always been: edit a constant or a drawing
# function here, re-run this script, then `pnpm export:assets` -- never
# hand-edit the `.blend` in Blender's UI and never hand-edit the exported
# `.glb`/`.collision.json`. Not an npm script and not a CI step (CI has no
# Blender); a developer runs it locally, with `BLENDER` exported.
#
# Authored entirely in the table frame (AD-10): millimetres-as-metres/1000,
# right-handed, origin bottom-left nearest the player, X right, Y up the
# playfield, Z toward the glass. Geometry is UNPITCHED -- every object's
# rotation is identity; pitch is applied later, only by presentation
# (rotating playfield_root about pivot_pitch) and physics (the gravity
# vector), never baked into a mesh here.
#
# `playfield_root`, `cabinet_root` and `pivot_pitch` are the three, and only
# three, top-level (unparented) objects (epics.md line 437, authoritative
# over AD-11's looser phrasing). Every other object here is parented under
# `playfield_root`, whose own transform is identity at authoring time, so a
# child's LOCAL coordinates equal its TABLE-frame world coordinates directly
# -- this script places every mesh vertex and every empty's `.location`
# straight in table millimetres-as-metres, with no separate object offset,
# which keeps both this script and `tools/export.py`'s world-matrix reduction
# simple and easy to verify by inspection.
#
# Built entirely from `bmesh` + low-level `bpy.data.*` calls, not
# `bpy.ops.*`: operator calls need a window/view-layer context that a
# `--background` invocation does not reliably provide, while the data API
# works identically headless or interactive.

import math
import os

import bpy
import bmesh
from mathutils import Vector

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MM = 1.0 / 1000.0  # table millimetres -> Blender metres (this file's own, one-shot conversion -- NOT sim/table/frames.ts, which owns every *runtime* conversion; this script only ever writes literal metre coordinates once, at seed time)

# ---------------------------------------------------------------------------
# AD-10 reference dimensions (TABLE.reference, src/sim/table/dragonwar.ts).
# ---------------------------------------------------------------------------
PLAYFIELD_W_MM = 514.4
PLAYFIELD_H_MM = 1066.8
FLIPPER_BAT_MM = 79.375  # 3.125 in
BALL_MM = 26.99  # TABLE.reference.ballMm -- Story 1.5's bd_trough eject-pose relocation

WALL_T_MM = 12.0
WALL_H_MM = 50.0
PLAYFIELD_THICKNESS_MM = 19.0
GLASS_Z_MM = 400.0
GLASS_THICKNESS_MM = 10.0

# Story 2.1b task 10 (DW-53): the true perimeter walls (left, top, right, and
# the plunger-lane wall separating it from the main field) now reach the
# glass -- derived from GLASS_Z_MM, not a second invented figure -- so a ball
# driven laterally at z = 200 mm (well above WALL_H_MM = 50) cannot escape
# the table through what used to be an open-topped boundary. Interior guides
# (the drain-triangle guides, the loop guides, the Dragon's legs, the DRAGON
# bank, the Ramp channel) stay at WALL_H_MM = 50 so the Ramp -- authored at
# deck height, see RAMP_HEIGHT_MM's own note -- and a ball's normal arc over
# a guide are never blocked by a wall taller than gameplay needs.
PERIMETER_WALL_H_MM = GLASS_Z_MM

# col_wall_lane's interior (lane-facing) clearance, main-field wall to
# right-perimeter wall. Widened from the original 20 mm (Review Findings,
# HIGH): once tools/export.py's wall reduction preserves real thickness
# instead of a zero-thickness centreline, col_wall_lane's lane-facing face
# becomes real collision geometry rather than being silently absent -- and
# 20 mm is narrower than the 26.99 mm reference ball. 34 mm clears the ball
# with a comfortable margin either side.
LANE_CLEAR_MM = 34.0
LANE_X0_MM = PLAYFIELD_W_MM - LANE_CLEAR_MM - WALL_T_MM  # 468.4 -- main-field-facing edge of col_wall_lane
LANE_WALL_TOP_Y_MM = 950.0  # gap above this lets a launched ball cross into the main field

DRAIN_X0_MM = 200.0
DRAIN_X1_MM = 314.4

# col_lane_deflector -- Story 1.5's provisional placeholder is RETIRED this
# story (DW-58): with the Left/Right Loops drawn (Story 2.1b, below), the
# Right Loop's own upper arc now does the job the deflector was standing in
# for -- a ball launched up the plunger lane crosses LANE_WALL_TOP_Y_MM = 950
# (where col_wall_lane itself stops) directly into the Right Loop's own lane
# (occupying x in [406.4, 418.4] at this height once past the funnel), which
# is what a real machine's own upper arc does, rather than a dedicated
# deflector wall. `bd_trough`'s eject pose at the lane foot is the real
# kicker position and is required by AD-6 to lie inside sw_shooter_lane
# (test/device-eject-pose.test.ts:63-64) -- it is derived from the shooter
# lane's own geometry, never invented, and is unaffected by this retirement.

# ---------------------------------------------------------------------------
# Story 2.1a -- the drain triangle: both outlanes, both inlanes, the
# inlane/outlane divider guides, the inlane's own outer guide (the one that
# closes each flipper's cradle-pocket throat) and a rubber post at every
# guide's free end (DW-72, DW-77, DW-78). Authored from the reference
# dimensions alone -- no Bally template, PRD OQ-6 -- and from the flipper
# mover's own derived geometry (never a second, independently invented
# figure).
#
# The pocket closes at the bat's TIP, not its pivot -- this story's own
# physics probes (not merely derived by inspection) found the pivot end
# unusable: `hitCircleBase` is a FULL CIRCLE of radius `baseRadius`, always
# centred at the pivot regardless of stroke angle, so any post close enough
# to catch a ball there combines with that angle-invariant circle into a
# permanent geometric trap -- the ball never left even after the flipper
# mover's own angle genuinely returned to rest, which fails AC 2's negative
# control ("the same arrangement with the key released reaches bd_trough")
# outright. The bat's TIP -- its end circle, radius `endRadius`, centred
# `flipperRadius` from the pivot -- genuinely SWEEPS with the stroke: at the
# raised end-of-stroke angle its outer edge reaches `flipperRadius +
# endRadius` from the pivot (matching the committed box's own tip edge
# exactly); at rest it swings well clear. A post placed just past that
# raised-angle reach, verified against the swept envelope by hand from the
# same atan2(dx, -dy) convention `flipper-config.ts`'s header documents, can
# only ever meet the tip circle AT the raised angle, never the pivot's own
# fixed base circle and never the swinging arm at any other angle.
# ---------------------------------------------------------------------------
GUIDE_T_MM = WALL_T_MM  # divider-guide wall thickness -- matches every other authored wall
OUTER_GUIDE_T_MM = 6.0  # the TIP-side outer guide is deliberately thinner than GUIDE_T_MM: it sits inside the reconciled 40.65 mm tip gap between the two raised bats (DW-78), and that gap must stay clear enough for a ball to pass even with both flippers held (this story's own centre-drain acceptance case) -- see POST_RADIUS_MM/POCKET_OFFSET_ALONG_MM's own note for the shared clearance budget.
OUTLANE_WIDTH_MM = 34.9  # authored, unverified -- see src/sim/table/tuning.ts's outlaneWidthLeftMm/outlaneWidthRightMm for the full provenance note (geometry-r2-1.md's low-confidence 1-3/8 in figure, adopted symmetrically for both sides)
POST_RADIUS_MM = 4.0  # placeholder rubber-post radius. Deliberately SMALLER than a typical real post (which runs 12-16 mm across the rubber sleeve): this same radius closes the pivot-side divider guide's own free ends AND the tip-side pocket, and the pocket sits inside the reconciled 40.65 mm tip gap (DW-78) -- verified this story's own planning pass: with POCKET_OFFSET_ALONG_MM below, the two tip-side posts leave 40.65 - 2*1 - 2*4 = 30.65 mm of clear surface-to-surface gap between them, comfortably above the 26.99 mm reference ball, so a centre-aimed ball still passes with both flippers raised.
GUIDE_Y_TOP_MM = 420.0  # this story's own placeholder guide extent -- Story 2.1b draws the rest of the shot map above this
# Story 2.1c: the OUTLANE/INLANE divider guide's own top is lowered from
# GUIDE_Y_TOP_MM to 380 (the tip-side col_guide_outer_* pair keeps 420 --
# that guide closes the cradle pocket and nothing here touches it). Measured
# reason: the guide's own top post (col_post_divider_*_hi, POST_RADIUS_MM =
# 4, so x 36.9..44.9 on the left) sat directly across the Loop lane's own
# mouth. A ball entering the mouth has to clear that post by
# BALL_RADIUS_MM + POST_RADIUS_MM = 17.5 mm, which left the lane's own
# 50 mm mouth admitting a shot only at x <= 23.4 -- and the loop RETURN rail
# below needs everything west of x = 30.5 to catch a descending ball. The
# two demands overlapped, so no shot could enter a lane whose return was
# diverted. Dropping the post 40 mm clears the mouth completely (the shot
# passes it at y >= 400, the post's own top is 384) while leaving the
# divider's own outlane-forming span, its lower post and both measured
# outlane widths untouched.
DIVIDER_Y_TOP_MM = 380.0
DIVIDER_Y_BOTTOM_MM = 120.0  # the outlane/inlane divider guide's own (higher, less pocket-critical) lower end
POCKET_OFFSET_ALONG_MM = 1.0  # pocket post centre, offset from the bat's own TIP further toward playfield centre (this story's own physics probes: the pivot end's base circle is angle-invariant and traps a ball regardless of stroke, so the pocket closes at the tip instead -- see add_drain_triangle_side()'s own doc comment). Kept small, together with the reduced POST_RADIUS_MM above, so the two posts never narrow the reconciled tip gap below the reference ball's own diameter.
POCKET_OFFSET_UP_MM = 24.0  # pocket post centre, offset from the pivot's own y (flipper centreline) UP-TABLE (away from the drain)

# ---------------------------------------------------------------------------
# Story 2.1b -- the rest of the shot map, drawn above GUIDE_Y_TOP_MM = 420:
# both Loops, the spinner, the Ramp, the off-centre Dragon with the Lock lane
# between its legs, the six-target DRAGON bank, three Top lanes, two
# slingshots and three pop bumpers. Every figure below is AUTHORED -- no
# source anywhere in the repository states a loop width, a ramp height, a
# Dragon footprint, a bank pitch, a Top-lane spacing, a sling span or a pop
# radius (verified against the research digests, this story's own planning
# pass) -- so each carries a one-line comment naming what it is and what
# would confirm it, matching AD-15's "do-not-invent numbers ship unverified"
# discipline even though these are millimetre figures, not TUNING entries
# (TABLE has no per-figure provenance mechanism; TABLE.authoredCounts below
# is the one exception, for the pop-bumper COUNT specifically, per the
# author's 2026-08-31 instruction -- see dragonwar.ts).
# ---------------------------------------------------------------------------

# Loops (task 3): the loop's clear lane width, authored WIDER than
# OUTLANE_WIDTH_MM (34.9 mm) on purpose -- the loop carries the spinner gate
# body (below) partway along its run, and 34.9 mm leaves only ~4 mm of ball
# clearance on each side even with nothing else in the lane, which is too
# tight to also host an obstruction. 50 mm leaves room for the spinner stub
# to protrude from one wall without narrowing the remaining clear path below
# the reference ball's own diameter (26.99 mm). Would be confirmed by a
# measured real orbit-lane width once a Reference-machine dimension exists.
# Story 2.1c: widened from 50 mm. DERIVED, not preference. With the orbit
# landing, each lane carries a ball in BOTH directions -- the shot climbing
# it and the other Loop's return descending it -- and the two cannot share a
# column, because the surface that carries the return inboard is, for a ball
# travelling the other way, a ceiling. Writing t for the return rail's own
# inboard tip and Wt for the top connector's own end (where the return drops
# into the lane), the three clearances are: the return must reach the rail
# (Wt drifts to <= t + BALL_R), the shot must pass east of the rail's tip
# (>= t + BALL_R) and west of the connector's own end (<= Wt - BALL_R). That
# leaves the shot a column exactly Wt - t - 2*BALL_R = Wt - t - 26.99 mm
# wide, and Wt is itself capped at LANE_CLEAR - BALL_R by the lane's own
# inner rail. At 50 mm the arithmetic closes to ZERO -- measured, not
# inferred: every entry offset tried either stalled against the rail (peak
# 492 mm against the 1016.8 mm the lane needs) or was missed by it and
# returned to the outlane. 66 mm opens a 9 mm shot column with a 27.5 mm
# catch zone below it, both comfortably resolvable.
LOOP_LANE_CLEAR_MM = 66.0
# The loop's own outer arc, offset in from the perimeter wall's interior face
# by LOOP_LANE_CLEAR_MM at the top of the table -- the top connector's own
# lane-facing (south) face.
# Story 2.1c: the TOP channel keeps its original 50 mm clear run -- it is
# no longer tied to LOOP_LANE_CLEAR_MM, which the side lanes had to widen to
# 66 mm to carry a ball in both directions. Deriving it from the widened
# figure would have dropped this connector (and, with it,
# col_loop_r_deflector, which is anchored on it) 16 mm down the table, to
# within 0.8 mm of LANE_WALL_TOP_Y_MM -- the exact corner-trap the
# deflector's own PLUNGE_DEFLECTOR_DROP_MM note rejects an 85 mm drop for.
LOOP_TOP_CLEAR_MM = 50.0
LOOP_TOP_INNER_Y_MM = PLAYFIELD_H_MM - LOOP_TOP_CLEAR_MM  # 1016.8
# Where each loop's lane widens from the OUTLANE-width funnel mouth (sharing
# the existing col_post_divider_*_hi post's own span, so no new post is
# needed at the bottom -- task 3: "from the two *_divider_*_hi posts") out to
# the full LOOP_LANE_CLEAR_MM run.
# Story 2.1c: the funnel no longer narrows the lane back onto the divider
# guide's own OUTLANE span -- that is exactly what made a completed Loop a
# one-way trip to the drain. It now bends the lane's INNER rail outward, so
# the lane's own mouth sits over the INLANE and the descending orbit ball is
# handed to col_guide_inlane_l/_r rather than to the outlane. y0 is dropped
# from GUIDE_Y_TOP_MM (420) to 438 to leave room for the rubber post that
# terminates the inlane guide's own upper end at 432 (POST_RADIUS_MM = 4;
# col_post_inlane_*_hi is authored at LOOP_FUNNEL_Y0_MM - GUIDE_T_MM / 2 =
# 438 - 6 = 432, spanning y 428..436 -- the comment said 434 until it was
# checked against the committed document at code review, 2026-09-03).
LOOP_FUNNEL_Y0_MM = 438.0
LOOP_FUNNEL_Y1_MM = 500.0  # authored -- a short, gentle widening run
# How far INBOARD (toward the table centre) the funnel's own bottom sits
# from the loop rail's own top. Sized from the inlane's own clear width: the
# channel between the divider guide's inboard face (46.9 left / 421.5 right)
# and the inlane guide is LOOP_FUNNEL_OFFSET_MM + LOOP_LANE_CLEAR_MM -
# OUTLANE_WIDTH_MM - GUIDE_T_MM = 39.1 mm, i.e. 12.1 mm of ball-centre
# freedom for the 26.99 mm reference ball -- comfortably more than the
# 7.9 mm the outlane itself offers, because a ball ARRIVES here across the
# lane rather than dropping straight in.
LOOP_FUNNEL_OFFSET_MM = 20.0

# The loop RETURN rail (Story 2.1c). The lane's own outer boundary is the
# perimeter wall, so a ball descending the OUTER part of the lane has
# nothing to slide along and drops straight into whatever is beneath it --
# which was the outlane. This rail is that missing surface: a plank across
# the lane's outer band, high end on the perimeter wall, low end above the
# divider guide's own OUTER face, so a ball descending there meets it and is
# carried inboard, leaving the rail already moving across the divider rather
# than along it.
#
# [CORRECTED 2026-09-03, code review] This comment used to claim the rail
# catches a ball descending ANYWHERE in the lane, quoting "ball centres run
# 13.5 to 36.5 mm from the wall". That was the 50 mm lane's arithmetic; at
# LOOP_LANE_CLEAR_MM = 66 the centres run 13.5..52.5, and the rail's reach
# is only LOOP_RETURN_END_X_MM + BALL_RADIUS_MM = 27.5. Traced through the
# real pipeline at every entry offset in test/shot-routing.test.ts's own
# Right Loop sweep: the ORBIT's descent does not use this rail at all -- the
# ball leaves col_loop_top at its own end (LOOP_TOP_END_X_MM = 50) and falls
# with vx ~ 0 (no x-gravity), crossing this rail's own y-band at x = 52.0
# to 52.1, some 38 mm east of the tip, straight into the inlane channel.
# What the rail actually does, and is sized for, is bound the ASCENDING
# shot's own column from the west (see LOOP_RETURN_END_X_MM below) and catch
# a WEAKER return that comes back down its own lane near the wall.
#
# The low end deliberately stops at OUTLANE_WIDTH_MM rather than reaching
# the inlane: the gap between the rail's own low end and the divider guide's
# own top post is what still lets a ball into the OUTLANE (a return that
# does not carry drops there, exactly as it does on a real machine), and it
# measures LOOP_RETURN_END_Y_MM - DIVIDER_Y_TOP_MM = 470 - 380 = 90 mm,
# comfortably more than the reference ball. (It read "470 - 420 = 50 mm"
# until this story dropped the divider's own top to DIVIDER_Y_TOP_MM;
# corrected 2026-09-03, code review.)
LOOP_RETURN_TOP_Y_MM = 530.0
LOOP_RETURN_END_Y_MM = 470.0
# How far INBOARD the rail's own tip reaches. Not a free choice: it fixes
# the WEST edge of the column the ball SHOT UP the lane has to climb (the
# tip plus one ball radius, 13.495 mm), while the lane's own inner rail
# costs another radius off the far side (LOOP_TOP_END_X_MM - BALL_RADIUS_MM
# = 36.5). 14 mm therefore catches everything up to x = 27.5 and leaves the
# shot the column x = 27.5..36.5 -- the same 9 mm figure LOOP_LANE_CLEAR_MM's
# own derivation quotes, and the band test/shot-routing.test.ts's own
# LOOP_ENTRY_OFFSETS_MM (28, 31, 34) samples. Measured against the real
# pipeline, not derived. (This comment quoted a 17 mm tip and a
# 30.5..36.5 column until 2026-09-03; the shipped value has been 14 mm --
# corrected at code review, no geometry changed.)
LOOP_RETURN_END_X_MM = 14.0

# The INLANE feed (Story 2.1c task 7). An inlane that merely receives the
# ball is half a delivery: the left inlane's own channel discharges at
# y = 200 onto col_wall_bottom_l, which is sloped toward the drain, so a
# ball that closes s_inlane_l and then simply falls drains without ever
# touching a bat. These two figures are the guide that carries it onto the
# bat instead -- a shallow ramp in PLAN (this solver's gravity runs down
# -y with no x-component, so an angled face is the only thing that moves a
# resting ball sideways -- the DW-119 mechanism), from just inboard of the
# divider guide down to just past the flipper's own pivot.
INLANE_GUIDE_Y0_MM = 200.0  # the inlane guide's own lower free end
INLANE_FEED_Y0_MM = 165.0   # the feed ramp's own high (inlane) end
INLANE_FEED_Y1_MM = 115.0   # the feed ramp's own low (bat) end, left side
INLANE_FEED_L_X0_MM = 52.0  # clear of col_guide_divider_l's own 46.9 face by 5.1 mm, so its own end post (r = 4) does not overlap the divider
INLANE_FEED_L_X1_MM = 175.0  # 5 mm past the LEFT bat's own pivot (170.0): a ball leaving here is inside FLIPPER_BAND_L and still descending
INLANE_FEED_R_X0_MM = 416.4  # mirror of the left figure about LANE_X0_MM -- the right inlane is anchored on col_wall_lane, not the true perimeter
INLANE_FEED_R_X1_MM = 356.0  # 11.6 mm past the RIGHT bat's own pivot (344.4), on the pivot side: dropping a ball dead ON a pivot is a measured equilibrium (test/drain-routing.test.ts's own PIVOT_EXCLUDE_MM band), so the feed deliberately lands to one side of it
INLANE_FEED_R_Y1_MM = 122.0  # the right feed's own low end -- shorter run than the left (the right inlane is 52 mm closer to its bat), so the ramp is a little steeper rather than a lot shallower

# Story 2.1c -- the ORBIT. A Loop is an orbit (prd.md:71): up one lane,
# ACROSS the joined top, and down the OTHER lane into that lane's own
# inlane. Two prior iterations spent fifteen measured, fully-reverted
# designs trying to make a ball reverse and cross ~50 mm laterally INSIDE
# the lane it entered; that approach is retired. The three constants below
# are what the orbit needs that the shot map did not have.
#
# (a) THE TOP TURN. Measured before anything was drawn (this story's own
# diagnostic harness, driving the pin's own Right Loop case at 2200 mm/s):
# a ball shot up either lane climbs DEAD STRAIGHT (vx reads exactly 0.0 for
# the whole ~650-tick ascent -- this solver's gravity has no x-component),
# bounces flat off col_wall_top (a horizontal face imparts no tangential
# impulse) and descends the IDENTICAL column back into the outlane it came
# from. Joining the top alone therefore delivers no orbit at all: the ball
# never travels along it. col_loop_turn_l/_r are the surfaces that turn the
# climb into a crossing -- the same angled-prism mechanism
# col_loop_r_deflector already proves for the plunge, mirrored into each
# lane's own top corner.
#
# The angle is DERIVED, not guessed. For an incoming velocity aligned with
# +Y and a face at angle `theta` from horizontal, an elastic reflection
# gives v' = (-v * sin(2*theta), -v * cos(2*theta)) -- so theta = 45 deg is
# pure lateral (v'y = 0) and every degree past it trades crossing speed for
# descent. Two constraints bracket it, both measured against the committed
# document:
#   * the deflected ball must clear col_loop_top's own north face
#     (LOOP_TOP_INNER_Y_MM = 1016.8, so ball centre >= 1030.295) all the way
#     to that wall's own end, or it clips the corner and rattles back;
#   * the ball must reach the face before col_wall_top (ball centre max
#     1053.305), or it never touches the turn at all.
# The contact height for a ball climbing at table x is
#   y_contact = LOOP_TURN_LOW_Y_MM + tan(theta) * run_x - BALL_RADIUS_MM /
#               cos(theta)
# (run_x measured from the turn's own low corner), so the usable entry band
# is (1053.305 - 1030.295) / tan(theta) wide. 40 deg keeps 98.5% of the
# climb as crossing speed while holding that band at ~27 mm -- wider than
# the ~23 mm of ball-centre travel either lane actually offers.
LOOP_TURN_ANGLE_DEG = 40.0
# The turn's own LOW corner, at the perimeter wall each lane runs against.
# Chosen so that every ball in the SHOT's own column (x = 27.5..36.5 mm from
# the wall -- see LOOP_RETURN_END_X_MM) strikes the hypotenuse inside the
# bracket the two constraints above define. Substituting into y_contact:
#   run_x = 27.5 -> 1036 + 23.075 - 17.616 = 1041.5 mm
#   run_x = 36.5 -> 1036 + 30.627 - 17.616 = 1049.0 mm
# both comfortably inside [1030.295, 1053.305] -- 11.2 mm of margin above
# col_loop_top's own north face at the low end of the column and 4.3 mm
# below col_wall_top at the high end. [CORRECTED 2026-09-03, code review:
# this derivation used to read "at 1044 the measured contact height for a
# ball hugging the outer wall is 1037.7 mm", which is the arithmetic for a
# 1044 mm low corner and for a wall-hugging ball the return rail's own
# column no longer admits. The shipped value has been 1036.0; only the
# comment moved.]
LOOP_TURN_LOW_Y_MM = 1036.0
# Where the top connector STOPS, measured in from each perimeter wall. This
# is the orbit's own hand-off point: a ball riding the connector's north
# face leaves it here and drops into the lane below, already drifting toward
# that perimeter wall (it is travelling outward along the top), which is the
# same side the return rail waits on. It also fixes the shot's own column
# (see LOOP_LANE_CLEAR_MM): the shot must pass WEST of this end on the left
# and EAST of it on the right, so the end sits one ball radius plus margin
# inboard of the lane's own inner rail.
LOOP_TOP_END_X_MM = 50.0

# Rework iteration 3 (author's answer A): how steep col_loop_r_deflector's
# own hypotenuse must be for the PLUNGE to clear the Right Loop's own
# entrance (col_loop_top's reach, x <= 428.4 + BALL_RADIUS_MM, y in roughly
# [991, 1030]) instead of catching its top-right corner and rattling in the
# loop's own pocket, which is what the previous (45 deg) angle measurably
# did (this story's own rework-iteration-2 evidence: ~1300 stray ticks in
# that pocket, zero ticks in the flipper band). Derived from this solver's
# own measured contact response, not guessed: driving the OLD 45 deg
# deflector and reading the ball's velocity the instant contact ends
# (test harness, this story's own rework pass) gives a post-contact split of
# ~79% of the incoming speed retained along the surface's own up-slope
# tangent and ~30% reflected along its outward normal -- i.e. for an
# incoming velocity aligned with +Y (a ball travelling dead straight up the
# shooter lane, which is exactly this table's own case, gravity having no
# x-component), the closed form is
#   v'x = -1.09 * vy_in * sin(theta) * cos(theta)
#   v'y =        vy_in * (0.79 * sin(theta)**2 - 0.30 * cos(theta)**2)
# where theta is the hypotenuse's own angle from horizontal (45 deg for the
# original deflector; verified this closed form reproduces the ORIGINAL
# deflector's own measured post-contact velocity, (-736, +331) mm/s from an
# incoming (0, +1354) mm/s, to within 1 mm/s on both axes). Solving it for
# the SAME incoming speed at theta = 68 deg gives a far steeper climb
# (v'y ~ 830 mm/s against the original's 331) while its own leftward
# component (v'x ~ -502 mm/s) is still large enough to carry the ball well
# past the Right Loop's own reach and, empirically (this story's own traced
# run against the regenerated document), across the whole table and down
# the left side -- see this file's own PLUNGE_DEFLECTOR_DROP_MM below for
# the resulting geometry and the trace this angle was chosen against.
PLUNGE_DEFLECTOR_DROP_MM = 50.0  # 34 mm run (the shooter lane's own clear width) at theta = atan(50/34) = 55.8 deg -- see the deflector's own node comment for why 85 (68.2 deg, tried first) is too steep: it lowers the hypotenuse's own low point (B) below LANE_WALL_TOP_Y_MM = 950, back into col_wall_lane's own reach, and a steep leftward bounce there rams the ball straight into that wall a few mm later, the same corner-trap class DW-119 already named elsewhere. 50 mm keeps the whole hypotenuse comfortably above 950 (B.y = 966.8) while still climbing far more than the original 34 mm did.

# Spinner (task 4, Left Loop only -- SPEC CAP-26 success clause,
# machine-behaviour.md:72). A thin stub protruding from the loop guide's own
# inner face, narrow enough that the reference ball still clears the
# remaining lane width comfortably (LOOP_LANE_CLEAR_MM - SPINNER_PROTRUDE_MM
# = 38 mm, above the 26.99 mm reference ball) -- this story draws the gate
# body and its sw_spinner zone only; the mechanical spin/revolution count is
# Story 2.3's (AD-6).
SPINNER_PROTRUDE_MM = 12.0
SPINNER_Y_MM = 648.0  # authored -- roughly midway along the Left Loop's straight run, between sw_loop_l_in and sw_loop_l_out

# Ramp (task 5): entrance right of centre (> PLAYFIELD_W_MM / 2 = 257.2 mm)
# so the LEFT flipper shoots it (FR-27) -- see docs/decisions.md for the
# return-inlane choice (OQ-6). The collision primitive set has no sloped-
# plane shape (export.py's COL_SHAPES/validate_col_shapes restrict
# shape='plane' to a z-normal horizontal plane, and the loader's plane-node
# whitelist admits only col_playfield/col_glass -- loader/index.ts:748-756),
# so the Ramp bed is authored as an ordinary deck-height convex-prism channel
# (surface='ramp' on its walls for the contact-sound channel only) rather
# than a literal 3D incline; "authored height and gradient" below is the
# figure a later story's visual ramp mesh would use, recorded honestly as
# unverified rather than modelled physically, since this collision model
# cannot express it yet.
RAMP_LANE_CLEAR_MM = 34.0  # authored -- comparable to a real ramp entrance width, narrower than the loop
# Story 2.1c: moved 372 -> 355 (west). The Right Loop lane widened to
# LOOP_LANE_CLEAR_MM = 66, so col_loop_r's own west face came in to 390.4
# and col_ramp_wall_r (ramp_lane_x1 .. +WALL_T_MM) had to clear it; the
# whole channel moved west by the same 17 mm rather than narrowing
# RAMP_LANE_CLEAR_MM, which test/asset-contract.test.ts still pins at 34.
# Still right of centre (355 > 257.2), so the LEFT flipper still shoots it
# and OQ-6's decided right-inlane return still holds. [The move was
# recorded in docs/decisions.md and docs/feel-test.md but carried NO note
# at the constant, which this story's own Always rule requires; added at
# code review, 2026-09-03 -- no value moved.]
RAMP_ENTER_X_MM = 355.0  # authored -- right of centre (> 257.2); pushed right of the DRAGON bank's own column (below) so neither shadows the other
# Story 2.1c: raised from 470. With both slingshots moved inboard to clear
# the inlane mouths, col_sling_r's own sloped north face now runs directly
# under the Ramp's own entrance, and a ball rolling down it wedged in the
# corner between that face and col_ramp_wall_l's own bottom end -- measured,
# parked at (348.6, 461.6). 485 leaves 33.5 mm of vertical clearance there,
# comfortably over the 26.99 mm ball.
RAMP_ENTER_Y_MM = 485.0
RAMP_TOP_Y_MM = 825.0
# Story 2.1c task 5. The Ramp's own return has never been deliverable: the
# committed document had col_ramp_return_1/2 INTERPENETRATING col_loop_r
# (144.000 mm2 and 53.706 mm2 of overlap, measured) and the channel they
# formed was 11.5 mm wide at y = 480, sub-ball for essentially its whole
# length. The reason is structural, not a drafting slip: the Ramp sits WEST
# of the Right Loop's own inner rail and the right inlane is fed only from
# EAST of it, so no rail routed down the corridor beside the Ramp can reach
# the inlane at all -- it is walled off by col_loop_r above and by
# col_guide_inlane_r below. A real ramp solves this the same way: its return
# wireform CROSSES OVER the orbit. This collision model is a plan section
# with no z, so the crossing is drawn as a gap in the loop rail at the
# return's own height, with the rail split into two nodes either side of it.
# The gap is above everything the orbit itself uses (the descending return
# hugs the perimeter wall at x ~ 440-455 and the shot climbs at 431.9-440.9,
# both measured, against a gap at x 390.4-402.4) so nothing leaks through it.
RAMP_RETURN_GAP_Y0_MM = 750.0
RAMP_RETURN_GAP_Y1_MM = 832.0
# The Ramp's own east wall stops BELOW the crossing, so the turned ball has
# somewhere to go. Above it the channel is open eastward, which is the whole
# point: the return is the crossing, not a rail beside the Ramp.
RAMP_WALL_R_TOP_Y_MM = 740.0
# The turn at the top of the Ramp's own channel. Same angled-prism mechanism
# as col_loop_turn_l/_r and col_loop_r_deflector: without it a made Ramp
# shot simply flies out of the open top of the channel (traced on the
# committed document: s_ramp_made closes at y = 790.9 and the ball keeps
# climbing to y ~ 1032, well past the return, then falls into unrelated
# geometry -- the fluke path Phase 1 recorded). A 45 deg face turns the
# climb into a crossing, at a height that clears the Ramp's own east wall.
RAMP_TURN_Y0_MM = 800.0  # swept 788/792/795/800/805 against the real pipeline; 800 is the only value tried at which EVERY in-channel entry offset (350..359 mm) lands the return inside sw_inlane_r rather than over col_guide_divider_r into the outlane
# The crossing rail's own east end. Not load-bearing for a MADE shot -- the
# turned ball clears it and lands in the loop lane directly, traced -- but it
# is the catcher for a weaker one, and it stops the 6.4 mm slot between the
# Ramp's own east wall and the Right Loop's lower rail from ever holding a
# ball.
RAMP_RETURN_END_X_MM = 402.0
RAMP_RETURN_END_Y_MM = 770.0
RAMP_HEIGHT_MM = 90.0  # authored -- the visual ramp's rise, unused by this collision model (see the note above); would be confirmed by a Reference-machine measurement once art replaces the placeholder (Story 5.x)
RAMP_GRADIENT = 0.20  # authored -- rise over run, unused by this collision model, same provenance note as RAMP_HEIGHT_MM

# Dragon (task 6): off-centre so a rejection deflects to a flipper
# (decisions-rejected.md:14, machine-behaviour.md:9) -- the RIGHT flipper
# takes it straight and the LEFT flipper backhands it, which places the body
# LEFT of PLAYFIELD_W_MM / 2 = 257.2 mm.
DRAGON_CENTER_X_MM = 170.0  # authored -- left of centre
LOCK_LANE_CLEAR_MM = 40.0  # authored -- "a narrow lane admitting a precise shot", narrower than every other lane this story draws
# [REWORK 2026-09-03, code review pass 2 HIGH finding] Story 2.1c's own
# Right-Loop widening (LOOP_LANE_CLEAR_MM 50 -> 66) forced the Ramp channel
# 17 mm west, which forced DRAGON_BANK_X0_MM 255 -> 235 -- 15 mm INSIDE
# col_dragon_leg_r's own x-shadow ([190, 250] at the pre-rework shared
# W = 60), re-creating the "physically unreachable" defect that constant's
# own derivation note exists to prevent (col_dragon_d wholly inside the
# shadow, col_dragon_r clipped by 1 mm). Restoring DRAGON_BANK_X0_MM to 255
# alone does not fix this -- col_ramp_wall_l stays at its shifted position,
# so the bank's own EAST side would then collide with the Ramp instead
# (measured: at X0 = 255 the bank's own east edge, 336, is 10 mm INSIDE
# col_ramp_wall_l's own shifted 326 mm west face). The right leg's own
# east edge had to retreat to reopen a corridor wide enough for the bank.
#
# First attempt (reverted, recorded because the trap it found is real and
# non-obvious): shrinking a single shared DRAGON_LEG_W_MM 60 -> 45
# symmetrically moved BOTH legs' outer edges, which conveniently leaves
# the "Dragon centreline" dimensional gate exactly true (both legs move by
# the SAME amount around the SAME lock-lane centre) -- but it also moved
# col_dragon_leg_l's own WEST face from 90 to 105, and measured against the
# real physics pipeline (test/shot-routing.test.ts's own "Lock lane" case,
# its long-drive tick budget), a ball ricocheting off the Dragon's own top
# structure settles into a genuine, stable wedge at (91.50, 502.00) --
# 13.495 mm (one ball radius) west of the relocated leg face AND
# simultaneously ~13.46 mm from col_loop_l_funnel's own north-east sloped
# edge (the (78,500)->(98,438) segment that hands an ascending Left Loop
# shot from the funnel onto its straight run) -- a genuine three-body
# corner trap between the (moved) leg, the (unmoved, orbit-owned) funnel
# edge, and col_playfield, that the leg's OLD 90 mm face was too far west
# to reach. Moving the LEFT leg at all risks the orbit's own geometry this
# story exists to protect, so it is wrong regardless of margin.
#
# Shipped fix: split into DRAGON_LEG_L_W_MM (unchanged, 60 -- col_dragon_leg_l
# and everything near it, including the funnel edge above, stays exactly
# where Story 2.1c's own orbit work left it) and DRAGON_LEG_R_W_MM (45 --
# the right leg alone retreats, and nothing on the right side of the Dragon
# is orbit geometry). This makes the two legs asymmetric, so the "Dragon
# centreline" dimensional gate can no longer read the centreline off the
# legs' own outer edges (that formula assumed symmetry); it now reads
# sw_lock_lane's own zone centre instead, which is (lock_lane_x0 +
# lock_lane_x1) / 2 = DRAGON_CENTER_X_MM by construction, in either leg's
# width -- a more robust measurement of the SAME product decision (FR-29),
# not a weaker one. Verified: col_dragon_leg_r = [190, 235] (identical to
# the reverted attempt's own right-side figure); col_dragon_leg_l stays
# [90, 150], byte-identical to its pre-rework footprint; the "Lock lane"
# stranding above does not reproduce (re-verified against the real
# pipeline after the split).
DRAGON_LEG_L_W_MM = 60.0
DRAGON_LEG_R_W_MM = 45.0
DRAGON_LEG_Y0_MM = 480.0
DRAGON_LEG_Y1_MM = 620.0
# Story 2.1d rework iteration 2 (code review 2026-09-03, HIGH -- the AC 2
# swallow was RE-SITED, not closed): both legs' own north cap is a SLOPED
# quad (add_box_wall_sloped, drop_corner='x1'), not a rectangle -- the
# corner nearer the Lock lane drops by DRAGON_LEG_CAP_DROP_MM below
# DRAGON_LEG_Y1_MM, so the leg's own TRUE solid material recedes above that
# point. For col_dragon_leg_r this recedes the OUTER (east) corner, leaving
# its lane-facing (west, x = lock_lane_x1) face solid the full 480..620 --
# fine. For col_dragon_leg_l it recedes the INNER (lane-facing, x =
# lock_lane_x0) corner instead, because 2.1c's own bevel-reversal (this
# file's own note at the leg's authoring site, below) requires the LEFT
# leg's low point on the LANE side, on pain of re-opening the col_loop_l
# wedge that reversal exists to close (a Block If: "would break Story
# 2.1c's delivered orbit"). So col_dragon_leg_l's own lane-facing face is
# solid ONLY for y <= DRAGON_LEG_L_INNER_SOLID_TOP_MM (600.0) -- ABOVE that
# it recedes diagonally toward the leg's own outer corner, and the corridor
# has NO wall there at all. This story's own iteration-1 pass measured the
# corridor's bounding assert against DRAGON_LEG_Y1_MM (620, the legs'
# bounding-BOX top) rather than this TRUE recession point, so the slot band
# (previously topping out at 612) sat 12 mm inside the gap: 15 of 15
# descending probes at x in [150, 190] parked, an 11-case regression over
# the pre-fix 7. Reverting the bevel direction is not available (the Block
# If above); extending DRAGON_LEG_Y1_MM past the slot band was tried FIRST
# and reverted for the DRAGON-bank contact-response regression the note
# below this block describes. The fix is a genuinely NEW body -- a sloped
# "ceiling" wall (col_lock_ceiling, authored where the legs are drawn,
# below) sealing the corridor from directly above, positioned at or below
# this true recession point rather than the bounding-box top, so no gap
# survives. A ceiling's OWN south face (the one a ball descending from
# open field contacts) does not need slope protection -- gravity's
# dominant -y component pulls a ball resting there AWAY from the wall, the
# opposite of the DW-119 freeze case (a wall's NORTH face, which gravity
# presses a descending ball INTO) -- but the ceiling's own NORTH face is
# exactly that same DW-119 hazard one level up, so it is sloped too, same
# as every other flat-topped body this story's own rework iteration 2
# fixed.
DRAGON_LEG_CAP_DROP_MM = 20.0  # authored -- the sloped-cap drop both legs' own add_box_wall_sloped() call below uses; named here (rather than left as each call site's own bare literal) because the corridor-sealing derivation below needs it too
DRAGON_LEG_L_INNER_SOLID_TOP_MM = DRAGON_LEG_Y1_MM - DRAGON_LEG_CAP_DROP_MM  # 600.0 -- above this, col_dragon_leg_l's own lane-facing face has receded; see the [REWORK] note above
DRAGON_MOUTH_Y_MM = 460.0  # bd_lock's own pose -- AD-6: "the Lock's pose IS the Mouth"
# [REWORK, rework iteration 2] Was 650.0 (north of the whole corridor, in
# open field) -- see this constant's own new siting rationale in the
# [REWORK] block above DRAGON_LEG_CAP_DROP_MM: col_lock_ceiling now seals
# the corridor's own north side, so a pose north of it could never eject a
# ball INTO the corridor at all (the ceiling would block the spawned ball's
# own downward travel on its very first tick). Re-sited south of every
# sw_lock_* zone and of sw_lock_lane instead -- clear of both
# (test/lock-device-behaviour.test.ts's own "no parking device's committed
# eject pose lies inside any of its own slot zones" regression guard, plus
# a new sw_lock_lane-clearance check this rework adds), comfortably clear
# of the legs' own south-cap termination posts (col_post_dragon_leg_l/
# r_south, x 120.00/212.50, DRAGON_CENTER_X_MM = 170 sits 50/42.5 mm from
# each) and of sw_dragon_body_l/r (x [94,146]/[194,231], outside the
# 150..190 lane entirely). AD-6's "aimed at the flippers" reads, if
# anything, MORE naturally from here: south of the whole Dragon structure
# is closer to the flippers than north of it ever was. The ejected ball
# now starts already past every sw_lock_* zone along its own eject axis
# (buildClearBeyond()'s own one-directional threshold), so the exemption
# this story's task 5 built clears on the spawn tick itself rather than
# after genuine travel -- a strictly SAFER configuration than before (the
# ball was never inside a zone to begin with), verified end-to-end below.

# Story 2.1d (task 8, DW-121-class swallow fix): the Lock lane's three slot
# zones used to sit at y 630..678 -- 10 mm above the legs' own top
# (DRAGON_LEG_Y1_MM, 620) -- in 230 mm of OPEN FIELD (nothing bounded
# x in [lock_lane_x0, lock_lane_x1] from y = 620 up to col_pop_3 at y = 850),
# so any ball merely crossing that band got swallowed by devices.ts's own
# zone-entry test, with no relation to the Lock at all.
#
# [REWORK] The first attempt extended the legs' own north face PAST the
# slot band (DRAGON_LEG_Y1_MM 620 -> 688) so the only opening was from
# below. Measured against the real physics pipeline, this reopened a
# defect in an UNRELATED integration case: test/switch-max-speed.test.ts's
# "a DRAGON-bank target...surfaces exactly one make" -- a ball driven
# straight at col_dragon_d's own aim point, at the table's measured maximum
# speed, made TWICE (col_dragon_d then its neighbour col_dragon_r) at EVERY
# leg-top height tried across the entire required range (678 through 700 mm,
# a nine-point sweep, this story's own throwaway harness) even though
# neither leg ever geometrically touches either target -- a genuine
# contact-response sensitivity in the solver's broad-phase to a distant,
# non-contacting wall's mere height, not something a small placement
# adjustment closes. The second attempt -- "re-site the slots down into the
# EXISTING bounded corridor" -- avoided the leg height, but (see the
# [REWORK] block above) measured the corridor's own top against the legs'
# BOUNDING BOX (620) rather than col_dragon_leg_l's own TRUE receded face
# (600), so the slot band still sat partly in the gap. This third pass
# lowers the slot band further still, so it sits entirely BELOW the true
# recession point, and adds col_lock_ceiling to seal the corridor's own
# north side at or below that same point -- re-verified: the
# switch-max-speed regression does not reproduce with the legs unmoved.
#
# sw_lock_lane's own span moves DOWN by the same amount the slot band does
# (its 60 mm height is unmoved) -- there is not enough room between
# DRAGON_LEG_Y0_MM and the true 600 mm recession point for sw_lock_lane's
# own unmoved 500..560 span, the 48 mm slot band and a real ceiling margin
# all at once; sw_lock_lane sliding down to sit flush with the corridor's
# own bottom (DRAGON_LEG_Y0_MM) is the cheapest way to find that room
# without touching the slot band's own pitch/depth (each independently
# derived and justified below) or DRAGON_LEG_Y0_MM (2.1b geometry this
# story has no reason to move). epics.md's own Story 2.3 AC (":2080")
# requires sw_lock_lane "unchanged OR RE-AUTHORED TO THE SAME NAME" --
# re-siting under the same name is exactly what that clause permits.
SW_LOCK_LANE_Y0_MM = DRAGON_LEG_Y0_MM  # 480.0 -- flush with the corridor's own bottom (was 500.0); see the block comment above
SW_LOCK_LANE_Y1_MM = SW_LOCK_LANE_Y0_MM + 60.0  # 540.0 -- the same 60 mm span 2.1b originally authored (500..560), just re-based
LOCK_SLOT_PITCH_MM = 17.0  # authored -- the y-distance between adjacent slots' own low faces: LOCK_SLOT_DEPTH_MM (14.0) plus a 3.0 mm gap, so two adjacent zones' boxes never touch (a ball's swept segment straddling both at once would otherwise register two simultaneous entries for one crossing)
LOCK_SLOT_DEPTH_MM = 14.0  # authored -- roughly half a ball diameter (26.99 mm) beyond the 13.495 mm radius, generous margin so a settling ball's own swept segment registers cleanly inside one slot's zone rather than straddling its boundary
LOCK_SLOT_COUNT = 3  # authored -- matches TABLE.ballDevices.bd_lock.capacity (dragonwar.ts); this script authors placeholder geometry from TABLE-independent literals (AD-1: sim/table owns the registry, Blender owns placement), so the count is repeated here rather than imported, and must move in lockstep with any change to bd_lock's own capacity
LOCK_SLOT_LANE_CLEARANCE_MM = 4.0  # authored -- gap between sw_lock_lane's own top face and the LOWEST slot's own low face, so a ball's swept segment straddling both zones never registers two simultaneous, unrelated entries
LOCK_LEG_TOP_CLEARANCE_MM = 6.0  # authored -- gap the HIGHEST slot's own top face leaves below col_lock_ceiling's own bottom face (was 8.0, against the legs' unmoved bounding-box top; re-measured against the new, tighter ceiling-bottom reference below)
LOCK_SLOT_Y0_BASE_MM = SW_LOCK_LANE_Y1_MM + LOCK_SLOT_LANE_CLEARANCE_MM  # 544.0 -- the LOWEST slot's own low face
# The highest slot's own top face: the (LOCK_SLOT_COUNT - 1)-th slot's low
# face (the base plus pitch * (count - 1)) plus one slot's own depth.
LOCK_SLOT_Y1_TOP_MM = LOCK_SLOT_Y0_BASE_MM + (LOCK_SLOT_COUNT - 1) * LOCK_SLOT_PITCH_MM + LOCK_SLOT_DEPTH_MM  # 592.0
# col_lock_ceiling's own south (bottom) face -- the corridor's TRUE north
# bound. Sealed at or below DRAGON_LEG_L_INNER_SOLID_TOP_MM (600.0, the
# left leg's own true recession point, not its bounding-box top) so no gap
# survives on that side; the right leg needs no such care (solid to 620
# regardless). Derived as slot-top-plus-clearance, exactly like the
# assert below checks, rather than authored independently, so the two can
# never silently drift apart.
LOCK_CEILING_Y0_MM = LOCK_SLOT_Y1_TOP_MM + LOCK_LEG_TOP_CLEARANCE_MM  # 598.0
assert LOCK_CEILING_Y0_MM <= DRAGON_LEG_L_INNER_SOLID_TOP_MM, (
	f'col_lock_ceiling must seal the corridor at or below the left leg\'s own TRUE (non-bounding-box) solid inner-face height '
	f'({DRAGON_LEG_L_INNER_SOLID_TOP_MM} mm) -- otherwise the exact rework-iteration-2 gap (DW-121-class) reopens: '
	f'ceiling bottom {LOCK_CEILING_Y0_MM} mm > recession point {DRAGON_LEG_L_INNER_SOLID_TOP_MM} mm'
)
# [REWORK, found empirically, three rounds] Round 1 overlapped each leg by
# a flat 4.0 mm -- correct for col_dragon_leg_r (whose own lane-facing
# face is solid the FULL 480..620, so any overlap closes cleanly), but
# WRONG for col_dragon_leg_l: its own material recedes above DRAGON_LEG_L_
# INNER_SOLID_TOP_MM (600), so a flat 4 mm overlap left a gap the leg's
# own diagonal kept retreating out of. Driving `descend-dragon-leg-l`
# (test/util/shot-cases.ts) end to end, a ball sliding down the leg's own
# sloped cap (per its own "toward the lane" bevel direction, 2.1c) came to
# rest permanently at (132.6, 620.0) -- simultaneously ball-radius
# distance from BOTH the leg's own diagonal AND col_lock_ceiling's own
# north-west corner, the same three-body wedge pattern 2.1c's own
# col_loop_l finding already named once.
#
# Round 2 tried closing that by stretching col_lock_ceiling's OWN west
# edge all the way to col_dragon_leg_l's own outer face -- overlap
# achieved, but ONE long diagonal spanning the full 90..194 mm width is
# far SHALLOWER than either leg's own 20 mm/60 mm slope, so it fell WELL
# BELOW col_dragon_leg_r's own fully-solid, un-receded lane-facing face
# (x = 190, vertical the full 480..620) for the eastern half of its own
# run -- moving the SAME class of wedge to the opposite corner (measured:
# a ball came to rest at (176.5, 616.7)).
#
# Round 3 split west into its own body (col_lock_ceiling_west_fill,
# tracking col_dragon_leg_l's own diagonal cap directly) and kept
# col_lock_ceiling's own single east-receding diagonal for the corridor
# -- this closed the WEST wedge but not the east one (re-measured:
# (176.5, 621.7), still ball-radius from BOTH col_lock_ceiling's own
# diagonal and col_dragon_leg_r's own vertical face) and OPENED A NEW one
# on the west fill's own north edge (measured: (139.5, 626.6)) -- its own
# south edge, tracking the leg over a 64 mm run (4 mm past lock_lane_x0),
# came out shallower (17.35 deg) than the leg's own proven 18.43 deg, and
# the SAME single-diagonal shortfall that broke rounds 1/2 reappeared one
# level down.
#
# The shared root cause across all three: a single 4-point quad, sloped
# corner-to-corner across its own FULL width, is EITHER too shallow (falls
# short of an adjacent tall face) OR forces an unsafe flat cap (if kept
# short/steep over only part of the width). col_lock_ceiling is now a
# RIDGE (5-point, the SAME shape col_loop_top's own pin -- descend-loop-
# top-west/east, both green throughout every round above -- already
# proves safe in this exact codebase): a flat SOUTH base sealing the
# corridor, two VERTICAL risers (a vertical edge's own outward normal has
# NO y-component at all, so DW-119's freeze condition -- a face gravity's
# y-component presses a ball into with zero tangential force -- cannot
# arise on one regardless of height), and a shallow ridge between two
# shoulders peaking at the centre -- never a stable trap (an
# unstable-equilibrium PEAK, not a valley: the same reasoning col_loop_top's
# own RIDGE_DROP_MM note already states). col_lock_ceiling_west_fill keeps
# its own south edge tracking the leg's diagonal exactly (2 mm inside it,
# over the SAME 60 mm run the leg itself uses -- 18.43 deg, not 17.35),
# and its own north edge is now the identical line offset far enough to
# match col_lock_ceiling's own riser height at the seam, so the two meet
# with a matched profile rather than a shortfall.
LOCK_CEILING_X_OVERLAP_E_MM = 4.0  # authored -- how far col_lock_ceiling's own east edge reaches past lock_lane_x1, into col_dragon_leg_r's own lane-facing face; that leg has no recession there, so a flat margin suffices.
# [REWORK, found empirically] col_lock_ceiling's own west edge was
# lock_lane_x0 exactly at first -- flush with col_lock_ceiling_west_fill's
# own east edge, so the two bodies' own west/east risers landed on the
# EXACT same vertical segment, and FOUR edges from two different bodies
# (each body's own riser plus its own adjacent slope) met at the single
# shared vertex (lock_lane_x0, 614). A ball settled there (measured:
# (149.2, 628.5)), ball-radius from col_lock_ceiling's own west ridge
# slope, in a way neither slope's own angle alone explains (both are
# steeper than the legs' own proven 18.43 deg) -- a coincident multi-body
# vertex, not a shallow-angle repeat of the earlier failures. A few mm of
# real X overlap between the two bodies avoids concentrating that many
# edges at one point.
LOCK_CEILING_X_OVERLAP_W_MM = 4.0  # authored -- how far col_lock_ceiling's own west edge reaches past lock_lane_x0, into col_lock_ceiling_west_fill's own territory (redundant there -- west_fill's own coverage already reaches the same height at that x -- but avoiding the coincident-vertex trap above). [REWORK ITERATION 3's own round 4 tried widening this to 60.0 mm (col_lock_ceiling's own west edge matching dragon_leg_l_x0 exactly), to CONTAIN west_fill's own north edge outright rather than merely clear it. That closed the west_fill seam completely (re-verified: every column from x = 114 to 194 made genuine progress) but reached far enough west to come within 12 mm of col_loop_l's own east rail (x = 78, spanning y = 500..1004.8, Story 2.1c) -- a body this story has no grant to touch and no reason to approach -- and stranded there instead (measured: (91.5, 668.5)). Reverted to this original 4.0 mm value: see LOCK_CEILING_RIDGE_MM's own comment below for the round-7 fix that closes the ORIGINAL west_fill seam without widening this overlap at all.]
LOCK_CEILING_SHOULDER_MM = 16.0  # authored -- how far above LOCK_CEILING_Y0_MM col_lock_ceiling's own WEST vertical riser reaches (598 -> 614) before the west flank begins; comfortably above DRAGON_LEG_L_INNER_SOLID_TOP_MM's own margin need. UNCHANGED throughout this whole rework -- only the PEAK's own height moved (LOCK_CEILING_RIDGE_MM, below); every attempt to touch anything else on the west side (rounds 3-6, below) made things worse, not better.
# [REWORK, found empirically, round 6 -- pre-dating this story's own rework
# iteration 3] An initial 4.0 mm rise from a SYMMETRIC shoulder (matching
# col_loop_top's own RIDGE_DROP_MM figure verbatim, over a much shorter run
# here) gave only atan(4/22) = 10.3 deg, well under this table's OWN
# apparent static-friction threshold (18.43 deg, atan(1/3)): a ball reached
# genuine, motionless equilibrium resting on the ridge's own east slope
# alone (measured: (181.0, 630.1), ball-radius from that single edge, no
# second contact) rather than sliding off. Raised to 10.0 mm with the peak
# offset dead-centre -- but the OFF-CENTRE choice (fraction 0.28 of the
# 48 mm body width, peak at x = 159.44) put only 13.44 mm of run on the
# west flank against 34.56 mm on the east: atan(10/13.44) = 36.65 deg west,
# but atan(10/34.56) = 16.15 deg EAST -- below the very threshold this
# constant exists to clear, and this story's own code review (2026-09-04)
# caught it stranding a ball at (182.6, 631.3), plus a SEPARATE strand at
# (190.0, 633.5) against col_dragon_leg_r's own cap corner (620).
#
# [REWORK ITERATION 3 -- seven further rounds to the shipped fix, all
# re-verified directly against the real physics pipeline, not by trig
# alone; each round's own strand coordinates recorded here so a future
# reader does not have to re-discover them.] Round 1 (peak offset from
# DRAGON_CENTER_X_MM, still a SINGLE symmetric-height peak) cleared both
# flanks' own angles on paper but not col_dragon_leg_r's own cap corner
# (620), which sat above the still-614 east shoulder regardless of angle --
# a genuine GAP no slope alone closes. Round 2 raised the east shoulder to
# clear that corner, but the SAME single peak then had to reach further and
# higher to keep the east flank's own angle safe, which stretched the WEST
# flank far enough to open a NEW strand against col_lock_ceiling_west_
# fill's own north edge (measured (163.1-163.2, 639.5)) the code review
# never named. Rounds 3 and 4 chased THAT west strand -- first a taller
# derived west shoulder (which only relocated the strand, to
# (136.4, 644.8) then (132.5, 646.1), because a vertical riser at a fixed x
# spans the SAME x for its whole height regardless of how tall it is),
# then widening the west overlap to genuinely CONTAIN west_fill's own
# territory (which closed that seam completely but reached far enough west
# to strand against col_loop_l's own unrelated east rail instead, measured
# (91.5, 668.5) -- a body this story has no grant to touch). Round 5 tried
# reverting the WEST shoulder to its original 614 while moving the SAME
# single peak close to the east shoulder to keep its own height low -- and
# still stranded (measured (162.7, 638.7)). Round 6 tried a genuinely
# SEPARATE second peak, entirely east of the original (unchanged) first
# peak -- STILL stranded, at the SAME class of location (measured
# (161.9, 640.5) and others), regardless of the second peak's own exact
# position or angle. The common thread across rounds 2, 3, 4, 5 AND 6: ANY
# col_lock_ceiling geometry with a point EAST of x = 159.44 (the original
# peak) TALLER than that peak reproduces the strand, independent of shape,
# angle or reach -- because it stops being the shape's own global maximum,
# and a ball landing anywhere on the resulting "uphill-then-down" profile
# gets intercepted by col_lock_ceiling_west_fill's own nearby material
# before gravity ever resolves which way it should roll. Round 7 (the
# shipped fix) keeps ONE peak, but RAISES it -- high enough that it clears
# col_dragon_leg_r's own corner AND stays the sole global maximum: with the
# peak at (159.44, 642) instead of the original (159.44, 624), the WEST
# flank (146, 614) to the peak is the ONLY part of this body's own shape
# that changes near west_fill, and (unlike rounds 2-6) it does so by
# raising the SAME single vertex the original safe geometry already used,
# never adding new material further east. Re-verified end to end: a wide
# descending-drop sweep across the WHOLE corridor width (x = 92 to 192)
# finds every column from x = 112 to 192 makes genuine progress -- the
# code review's own east-side finding (x = 174..190) and every west-side
# strand rounds 2-6 opened are both closed. A narrower residual (x = 92 to
# 110, against col_dragon_leg_l's own cap, NOT against west_fill) remains
# and is recorded honestly in this story's own frontmatter `deferred:` --
# see this constants block's own closing note, and LOCK_CEILING_RIDGE_MM's
# own comment, below, for the full account.
LOCK_CEILING_RIDGE_PEAK_FRACTION = 0.28  # authored -- unchanged from rework iteration 2's own original derivation: how far across col_lock_ceiling's own x0..x1 span the peak sits (146 + 48 * 0.28 = 159.44). Only this peak's own HEIGHT (LOCK_CEILING_RIDGE_MM, below) moved this rework; its own x position did not.
LOCK_CEILING_RIDGE_MM = 28.0  # authored, rework iteration 3 round 7 -- the peak's own rise above LOCK_CEILING_SHOULDER_MM (614 -> 642), raised from the original 10.0 (624). See the [REWORK ITERATION 3] note above for the six rounds this replaces: the peak must clear col_dragon_leg_r's own corner (620) via the EAST flank's own angle (atan((642-626)/34.56) = 24.85 deg, comfortably above 18.43 -- and the east flank reaches 627.85 mm at x = 190, the corner's own x, a real 7.85 mm margin) while remaining col_lock_ceiling's own SOLE global maximum -- the property that keeps the WEST flank safe (see the note above for why any taller point further east reopens the strand regardless of its own shape). This IS a real change to the west flank's own reach (rise 28 mm over the same 13.44 mm run, 64.4 deg, versus the original 36.65 deg) -- unlike rounds 2-6, which each added NEW material further east while leaving this flank's own two endpoints nominally unchanged, this round changes exactly one endpoint of the ALREADY-existing flank. CRITICALLY, this raised peak also raises col_lock_ceiling_west_fill's own required thickness: LOCK_FILL_THICKNESS_MM's own LIVE formula (below) means west_fill's own north edge rises WITH this peak (36 -> 54 mm), which is load-bearing, not incidental -- see that constant's own comment for the direct A/B confirmation (hard-coding it back to 36 immediately re-strands the west side). With both raised together, a wide sweep finds a narrower, DIFFERENT residual (x = 92..110, against col_dragon_leg_l's own cap -- a pre-existing, latent near-miss this rework did not create, only exposed by redirecting trajectories that used to roll past the original, shorter col_lock_ceiling without ever reaching it) rather than the west_fill strand every other round reopened. Recorded honestly in this story's own frontmatter `deferred:` rather than chased further: it is outside every committed shot case's own reachable trajectory (test/shot-routing.test.ts's full 39-case suite and the 472-release check:reachability sweep both stay green, re-verified after this change) and outside this story's own new SHOT_CASES columns (x = 120, 150, 185, all within the now-safe x = 112..192 range).
LOCK_CEILING_EAST_SHOULDER_MM = 28.0  # authored, rework iteration 3 -- how far above LOCK_CEILING_Y0_MM col_lock_ceiling's own EAST vertical riser reaches (598 -> 626) before the east flank begins. Deliberately taller than the WEST shoulder (614, unchanged): col_dragon_leg_r's own cap corner sits at y = 620 (unlike the WEST leg, this one has no recession -- task 8's own note), so the east shoulder must clear 620 with real margin or the gap between col_lock_ceiling's own material and that corner becomes a two-body bridging trap regardless of the east flank's own slope angle (round 1's own failure, above). 626 clears it by 6 mm; re-verified directly (a ball dropped at x = 190, directly over the corner, makes genuine positional progress rather than settling there).
LOCK_FILL_WEST_MARGIN_MM = 2.0  # authored -- how far below col_dragon_leg_l's own diagonal cap col_lock_ceiling_west_fill's own south edge sits, the whole 60 mm run (the SAME two-point line the leg's own cap is, merely shifted -2 mm in y, so it can never fall short of that leg's own true boundary anywhere along its run)
# [REWORK, found empirically, round 5 -- pre-dating this story's own rework
# iteration 3] Matching col_lock_ceiling_west_fill's own north edge height
# EXACTLY to col_lock_ceiling's own shoulder (16.0 mm) still parked a ball
# (measured (147.2, 629.1), ball-radius from col_lock_ceiling's own west
# ridge slope) once col_lock_ceiling's own west edge moved off
# x = lock_lane_x0 (round 4's own fix, above): the two bodies' own
# north-boundary heights were then close but no longer exactly equal in
# the 4 mm overlap band, leaving a THIN near-miss concentration in the
# same place a genuinely coincident vertex did. Matching heights precisely,
# twice now, has cost more than it saved -- west_fill's own north edge
# instead clears col_lock_ceiling's own highest point (its ridge peak) by
# a real margin throughout the whole overlap band, so there is no height
# at which the two bodies' own boundaries are ever close to each other.
#
# [REWORK ITERATION 3, round 7 -- confirmed, not merely assumed, still
# load-bearing.] This formula ties west_fill's own thickness LIVE to
# col_lock_ceiling's own peak height (LOCK_CEILING_SHOULDER_MM +
# LOCK_CEILING_RIDGE_MM + 10.0) -- and this rework's own round 7 fix
# raised that peak (614 -> 642, LOCK_CEILING_RIDGE_MM 10.0 -> 28.0), which
# moves this formula's own result too (36 -> 54) unless deliberately
# decoupled. An EARLIER pass of this same fix tried exactly that
# deliberate decoupling -- hard-coding this constant to the ORIGINAL 36,
# reasoning that col_lock_ceiling_west_fill's own geometry was
# "independently proven safe" and had no reason to track col_lock_
# ceiling's own peak at all -- and directly re-broke the west-side strand
# this round exists to close (measured (147.8, 649.0), col_lock_ceiling's
# own RAISED peak now itself within one ball diameter of west_fill's own
# UN-raised north edge). Reverting to the live formula (below) closed it
# again immediately, confirming the ORIGINAL coupling was correct all
# along: west_fill's own thickness genuinely does need to track whatever
# col_lock_ceiling's own tallest point currently is, not a value frozen at
# the moment rework iteration 2 shipped. Re-verified directly: a wide
# sweep across the WHOLE corridor width finds every column from x = 112 to
# 192 makes genuine progress with this live formula in place, and
# immediately re-strands the moment the formula is hard-coded back to 36.
LOCK_FILL_THICKNESS_MM = LOCK_CEILING_SHOULDER_MM + LOCK_CEILING_RIDGE_MM + 10.0  # authored -- see the [REWORK ITERATION 3] note above: LIVE, not a frozen literal -- clears col_lock_ceiling's own highest point (its ridge peak, now 642 mm) by a flat 10 mm throughout the overlap band, rather than matching any one of its heights exactly. 16 + 28 + 10 = 54 mm today.
# [REMOVED, code review 2026-09-04 (build-auto review pass, edge-case-hunter
# finding): this used to be `assert LOCK_SLOT_Y1_TOP_MM + LOCK_LEG_TOP_
# CLEARANCE_MM <= LOCK_CEILING_Y0_MM`. LOCK_CEILING_Y0_MM (above) IS DEFINED
# as `LOCK_SLOT_Y1_TOP_MM + LOCK_LEG_TOP_CLEARANCE_MM` -- the assert compared
# that expression to itself (`x <= x`), which can never fail regardless of
# how far the slot band or the clearance move, and so protected nothing.
# The real invariant this was meant to guard -- the ceiling's own bottom
# face sealing at or below the corridor's TRUE (non-bounding-box) recession
# point -- is already the assert at LOCK_CEILING_Y0_MM's own definition
# above, which compares two INDEPENDENT quantities (LOCK_CEILING_Y0_MM
# against DRAGON_LEG_L_INNER_SOLID_TOP_MM) and can genuinely fail.

# DRAGON bank (task 7): six target faces spelling D-R-A-G-O-N, legible from
# the fixed camera, left of the Ramp's own channel so neither crosses the
# other.
DRAGON_BANK_Y0_MM = 700.0
DRAGON_BANK_Y1_MM = 708.0
# Story 2.1b planning-pass finding (verified empirically, not by inspection):
# the Dragon's own legs are REAL solid col_ bodies spanning the FULL
# interior height (z 0..WALL_H_MM) across x in [90, 150] (left,
# DRAGON_LEG_L_W_MM, unmoved since 2.1b) and [190, 235] (right,
# DRAGON_LEG_R_W_MM -- see that constant's own [REWORK] note for why the
# right leg alone retreated, 250 -> 235), y in [480, 620]. A bank starting
# at x = 90 (this constant's
# own original value) put four of its six targets directly behind that
# shadow, physically unreachable by any straight shot from below regardless
# of the bank's own y (driving a ball at the measured maximum speed through
# the real createMachine() pipeline showed it deflecting off a leg's top
# edge well short of the bank -- this file's own switch-zone placement note
# beside sw_dragon_body_l/r explains the one-ball-radius reachability limit
# the SAME mistake nearly repeated here). The bank's own x-span was
# therefore anchored clear of the right leg's own east edge (with margin)
# and the Ramp pushed right of it in turn (RAMP_ENTER_X_MM, above) so
# neither shadows the other.
#
# [REWORK 2026-09-03, code review pass 2 HIGH finding, RESOLVED] Story 2.1c
# moved this constant 255 -> 235 so col_ramp_wall_l could clear the widened
# Right Loop lane -- 15 mm INSIDE the "> 250" bound the paragraph above
# derives, re-creating the exact defect it exists to prevent: measured
# against the committed document, col_dragon_d spanned x 235..246, wholly
# inside col_dragon_leg_r's own x-shadow (190..250), and col_dragon_r
# (249..260) was clipped by 1 mm. Restoring 255 alone does not fix this --
# col_ramp_wall_l stays at its shifted 326 mm west face, so the bank's own
# EAST edge would then be only 336 - 326 = -10 mm clear (an overlap, not a
# margin) -- so per this constant's own prior note, the bank, the Ramp's
# west wall and the Right Loop's own lane budget were re-solved together:
# DRAGON_LEG_R_W_MM (above) shrank 60 -> 45 (the LEFT leg, DRAGON_LEG_L_W_MM,
# is untouched -- an earlier, reverted attempt shrank both legs and found a
# genuine corner trap against the Left Loop's own funnel edge; see that
# constant's own note), pulling col_dragon_leg_r's own east edge back from
# 250 to 235 -- the widened lane's own geometry (col_ramp_wall_l,
# col_loop_r) is untouched. X0 = 235 + 5 mm margin = 240,
# the same ~5 mm the pre-2.1c design carried on each side (255 was "> 250"
# by 5). Verified against the re-exported document: col_dragon_d now spans
# 240..251 (5 mm clear of col_dragon_leg_r's own 235 mm east edge) and
# col_dragon_n (the bank's own east end, X0 + 81) spans 310..321, leaving
# 326 - 321 = 5 mm clear of col_ramp_wall_l's own west face -- both margins
# restored to the pre-2.1c design's own figure, symmetrically.
#
# NOT fully resolved by this move, recorded rather than silently claimed
# fixed: the bank's own reachable APPROACH corridor -- col_guide_outer_r's
# east face (279.525, untouched 2.1a geometry) to col_sling_r's own west
# face (314.0, Story 2.1c's OWN inboard slingshot move, task 8, explicitly
# "not this story's to re-derive" since the slingshot's span is Story 2.2's
# hardware) -- is still only 34.475 mm wide (7.485 mm of ball-centre
# freedom) and is UNAFFECTED by this X0/leg-width fix, since neither
# boundary of that corridor moved. At X0 = 240 the six targets span
# D 240-251, R 254-265, A 268-279, G 282-293, O 296-307, N 310-321; G and O
# sit ENTIRELY inside the corridor (fully strikeable from directly below),
# A's own east edge (279) falls 0.525 mm short of it, and only N's own west
# 4 mm (310-314) reaches it before col_sling_r's own body starts -- D, R and
# most of N remain a bank shot or an angled approach's own targets, not a
# straight descending one.
# [CORRECTED 2026-09-03, code review pass 3] The two sentences that stood
# here -- "UNAFFECTED by this X0/leg-width fix, since neither boundary of
# that corridor moved" and "Same structural limit the pre-fix state had (the
# corridor itself did not move)" -- are both FALSE, and the ledger entry and
# spec text that repeat them inherit the error. Measured against this
# story's own baseline (43a9c37): col_sling_r was x[360.000, 410.000] and is
# now x[314.000, 370.400], so its west face -- the corridor's own EAST
# boundary -- moved 46 mm west IN THIS STORY (SLING_R_X0_MM, below). The
# corridor from col_guide_outer_r's east face (279.525, genuinely unmoved)
# was therefore 80.475 mm before this story and is 34.475 mm after it.
# Direct-from-below reachability fell from FOUR of six targets (the baseline
# bank spanned D 255-266 ... N 325-336 against ball centres 293.020-346.505)
# to TWO. This is a consequence this story INTRODUCED, not one it inherited,
# and the spec's own Explicit permission block names col_sling_r among the
# bodies it MAY move -- so "not this story's own geometry to move" was
# wrong on both counts. Ledgered as DW-136 (the ledger, not this comment,
# is authoritative on the id; see also SLING_R_X0_MM's own note).
DRAGON_BANK_X0_MM = 240.0
DRAGON_BANK_PITCH_MM = 14.0  # authored -- centre-to-centre spacing between the six targets, narrowed to fit clear of both legs and the Ramp
DRAGON_BANK_TARGET_W_MM = 11.0

# Top lanes (task 7): three, in the upper field on the launched ball's own
# path (above the Ramp and the pop nest, below the loop's own top connector).
TOP_LANE_Y0_MM = 950.0
# Story 2.1d (task 9, guide termination): was the bare literal 1000.0, whose
# dividers' own upper tips then sat 4.8 mm short of col_loop_top's own south
# face (LOOP_TOP_INNER_Y_MM - GUIDE_T_MM = 1004.8) -- a genuine, joinable gap
# a ball's own contact point could still reach along the divider's face, not
# an exemption-worthy "no ball can reach it" end. Extended to meet
# col_loop_top's own face exactly, the same "genuinely joined end" pattern
# col_loop_l/r's own upper ends into col_loop_top already use, rather than
# adding a fourth pair of posts for a gap this small.
TOP_LANE_Y1_MM = LOOP_TOP_INNER_Y_MM - GUIDE_T_MM  # 1004.8
# Story 2.1c review fix: divider 4 used to sit at x = 395 (the uniform 100 mm
# pitch), footprint x 391..399 -- fully swallowed by col_loop_r once this
# story widened the Right Loop's lane (LOOP_LANE_CLEAR_MM 50 -> 66) and moved
# col_loop_r's west face to x = 390.4 (measured: 400 mm^2 solid-on-solid
# interpenetration, found by review, confirmed against the committed
# document -- col_top_divider_4's whole 8x50 mm footprint was inside
# col_loop_r's, making it physically unreachable). Moved to 376.0 -- clears
# col_loop_r's west face by 10.4 mm (380 -> 390.4) -- rather than shifting
# all four dividers, which would instead collide col_top_divider_1 with the
# symmetrically-widened col_loop_l (west edge 78, divider 1's old west edge
# 91 leaves only 13 mm of margin to spend). Consequence, recorded: the
# divider_3->divider_4 pitch is now 81 mm, not the other three gaps' 100 mm
# (test/asset-contract.test.ts's own pitch gate updated to match).
TOP_LANE_DIVIDER_XS_MM = (95.0, 195.0, 295.0, 376.0)  # four dividers -> three lanes; last gap 81 mm, not 100 (see above)
TOP_LANE_DIVIDER_T_MM = 8.0

# Slingshots (task 8): above the inlanes, clear of the flipper's own swept
# envelope and the reconciled tip gap (2.1a's own bound, this story's own
# "Always" rule) -- verified against test/flipper-sweep-clearance.test.ts.
SLING_Y0_MM = 420.0
SLING_Y1_MM = 455.0
# Story 2.1c: both slingshots move INBOARD. Measured on the committed
# document before the move: the corridor between col_guide_divider_l's own
# inboard face (46.9) and col_sling_l's own outboard face (70.0) is
# 23.1 mm, against a 26.99 mm ball -- so the left inlane was not merely
# unfed, it was physically UNREACHABLE from above, and the same held on the
# right (421.5 - 410.0 = 11.5 mm). No return routing can deliver a ball
# through a corridor narrower than the ball. Moved out to 98.0 / 370.4,
# which is LOOP_LANE_CLEAR_MM + LOOP_FUNNEL_OFFSET_MM + GUIDE_T_MM from each
# side's own anchor -- flush with the inlane guide the funnel now hands the
# ball to, so the sling sits just inboard of the inlane rather than across
# its mouth.
# [CORRECTED 2026-09-03, code review] This note read "Moved out to 92.0 /
# 376.4, which is OUTLANE_WIDTH_MM + GUIDE_T_MM + LOOP_FUNNEL_OFFSET_MM +
# GUIDE_T_MM" -- three different figures in one sentence: the shipped values
# are 98.0 / 370.4 (confirmed against the committed document), and the
# formula quoted evaluates to 78.9, not to either. Only the comment moved.
# It also claimed the right sling "keeps a comparable span"; measured, the
# spans are now col_sling_l 32.0 mm and col_sling_r 56.4 mm (they were 60
# and 50 before), so the pair is markedly ASYMMETRIC. Recorded rather than
# re-cut, because both slingshots are Story 2.2's hardware and their spans
# are not this story's to re-derive -- but a later story sizing sling
# geometry should not read "comparable" here and believe it.
# [ADDED 2026-09-03, code review pass 3] SLING_R_X0_MM is the one figure in
# this block that is a bare literal rather than a derivation, and it is the
# most consequential thing this story moved on the right side: 360.0 -> 314.0
# (measured against baseline 43a9c37's own committed document). It is
# recorded here because the Always rule requires every moved bound to carry
# its measurement, and this one carried none. Two measured consequences, both
# of them this story's own and neither of them inherited:
#   * DRAGON bank approach corridor (col_guide_outer_r east face 279.525 ->
#     this face): 80.475 mm -> 34.475 mm, i.e. ball-centre freedom 53.485 mm
#     -> 7.485 mm. Direct-from-below reachability 4 of 6 targets -> 2 (G, O).
#     Ledgered DW-136.
#   * The Ramp channel's own approach. To enter the channel at y = 485 a ball
#     centre must be in [351.495, 358.505]; passing the slingshot's own band
#     (y 420..455) admits centres only up to this face minus a ball radius,
#     now 300.505 (was 346.505). The shortfall was 21.990 mm before this
#     story and is 50.990 mm after it. Measured against the real physics
#     pipeline at code review: 256 swept releases below the sling band
#     (x 285..360 step 5, aim -20..+30 deg, 1800 and 2400 mm/s) close
#     s_ramp_enter ZERO times. test/shot-routing.test.ts's Ramp case passes
#     only because driveShot() repositions the ball at (355, 465), inside the
#     ~2 mm slot above the sling that no shot can reach. Ledgered DW-137.
# Neither consequence is a reason to revert this value blind -- the sling
# moved to clear the widened Right Loop lane the orbit needs -- but the
# right-side budget (sling span, Ramp walls, DRAGON bank, loop lane) has to
# be re-solved together, which is a decision above this constant.
SLING_L_X0_MM, SLING_L_X1_MM = LOOP_LANE_CLEAR_MM + LOOP_FUNNEL_OFFSET_MM + GUIDE_T_MM, 130.0
SLING_R_X0_MM, SLING_R_X1_MM = 314.0, LANE_X0_MM - LOOP_LANE_CLEAR_MM - LOOP_FUNNEL_OFFSET_MM - GUIDE_T_MM

# Pop bumpers (task 8): a nest of exactly three (author-decided 2026-08-31 --
# see ## Boundaries & Constraints and TABLE.authoredCounts in dragonwar.ts).
POP_BUMPER_RADIUS_MM = 20.0  # authored -- a common pop-bumper body radius
# Switch-zone half-extent around each pop's own centre. Verified this story's
# own planning pass, not merely derived by inspection: a ball's own CENTRE
# can never approach closer than POP_BUMPER_RADIUS_MM + one ball radius
# (20 + 13.495 = 33.495 mm) to the post's centre before its surface contacts
# the solid body -- a zone half-extent at or below that (25 mm, this
# constant's own original value) puts the box's own STRAIGHT EDGES entirely
# inside the unreachable disc (only the box's own CORNERS, at
# half_extent * sqrt(2), reach past it), so a ball approaching dead-centre
# from any single direction never enters the zone at all (driving a ball at
# a pop through the real createMachine() pipeline showed zero switch events
# despite a visibly close pass -- the same reachability class of mistake
# sw_dragon_body_l/_r and sw_dragon_* nearly repeated, this file's own notes
# beside them). 38 mm clears the 33.495 mm reach limit on every edge, not
# only at the corners.
POP_ZONE_HALF_MM = 38.0

# ---------------------------------------------------------------------------
# Story 2.1a task 22 (DW-119): the below-deck outlane return channel. Both
# outlanes used to dead-end on col_wall_bottom_l/_r -- a ball released there
# came to rest against the wall and stayed (measured: parked one ball radius
# above y = 0), because gravity here has no X-component at all, only Y and Z
# (the table's pitch axis), so nothing ever pushed it sideways toward the
# drain aperture without a wall to redirect it.
#
# A real machine solves this by dropping the outlane ball through the
# playfield into a subway that delivers it to the same trough the centre
# drain feeds -- the flippers physically occupy the direct on-deck path from
# an outlane to centre, so going under is the only route that does not
# require moving the flippers or the drain aperture. This is modelled the
# same way: col_wall_bottom_l/_r each open a gap EXACTLY as wide as the
# outlane above them, no wider (see the wall table below -- widening it any
# further removes wall coverage from the CENTRE/inlane area a ball can rest
# on during ordinary, unrelated gameplay, reproduced directly this task's
# own implementation pass: a first attempt that widened the gap broke an
# existing golden replay whose ball rests well outside the true outlane's
# own width). A single rail per side (add_outlane_return_channel()), on the
# side of the gap TOWARD the true perimeter, picks the ball up on the far
# side of that gap and walks it into the SAME untouched
# DRAIN_X0_MM..DRAIN_X1_MM aperture the centre drain already uses -- never a
# new hole, never a moved trough zone.
#
# Getting here took three rejected designs, all found empirically this
# task's own implementation pass, not by inspection:
#
# (1) A single straight rail alone. col_wall_bottom_l/_r's own face
# (unwidened, right at the true outlane boundary) is reachable by a ball's
# CENTRE anywhere within one ball radius (~13.5 mm) of that face in X, for
# ANY Y within one ball radius of that wall's OWN y in [-12, 0] -- i.e. Y
# roughly in [-25.5, +13.5], not merely [-12, 0], because the ball's own
# body extends a radius past its centre. A rail shallow enough to also
# reach the drain aperture within the trough zones' own y budget (~68 mm
# over ~200 mm of X) does not clear that widened Y reach before its own X
# has already carried the ball into the wall's X reach -- the ball settles
# into a genuine resting GRAZE simultaneously against BOTH faces (near-zero
# relative velocity, a real two-wall pinch, not "a shallow wall alone") and
# never reaches the rest of the channel. Reproduced directly: the identical
# lock persisted, at the identical table position, regardless of the rail's
# own slope, including a manifestly steep 45 deg one -- proving the shallow
# angle itself was never the defect. A diagnostic (col_wall_bottom_l's face
# temporarily moved out of reach, the same shallow rail re-tested in
# isolation) confirmed it carries the ball to the aperture cleanly once
# nothing else is nearby -- the fix therefore had to remove that face from
# reach, not out-race it. add_bottom_wall_quad() (below) does exactly
# that, chamfering col_wall_bottom_l/_r's own inner corner away from the
# outlane by BOTTOM_SWEEP_MM.
#
# (2) A SECOND, parallel rail added on the centre side, to "fully enclose"
# the ball -- rejected twice over. A steep (45 deg) shared entrance shrinks
# the two rails' own PERPENDICULAR interior width to
# OUTLANE_WIDTH_MM * cos(entrance angle), 24.68 mm at 45 deg: narrower than
# the 26.99 mm reference ball itself, physically impossible to pass through
# (reproduced directly: wedged at the entrance's own start corner). A wider,
# funnelled second rail (starting wide of the first, narrowing to the exit)
# fixed THAT, but a ball on the first rail's own face was then, at some
# point along the run, always within one ball radius of the second rail's
# own corner or back edge too (both rails are convex QUADS, not bare lines
# -- add_channel_rail()'s own thickness, offset straight down, still puts a
# second real corner within reach at certain angles) -- a genuine two-wall
# pinch again, just between this story's OWN two rails rather than against
# col_wall_bottom_l/_r. Reproduced at three different attempted offsets,
# each relocating the identical pinch rather than removing it.
#
# The design that actually ships is (1) alone, once (2)'s own chamfer
# removes the one nearby surface a lone rail's own face could ever pinch
# against: a SINGLE rail, bent once (KNEE_DROP_MM below) to clear
# col_wall_bottom_l/_r's own remaining, unavoidable TOP corner too (the one
# add_bottom_wall_quad()'s chamfer cannot move, since it still blocks
# an on-deck ball crossing y = 0 outside the outlane). No second rail
# "fully encloses" the ball, so its exit X is verified empirically (this
# story's own AC 7 routing test) rather than guaranteed by construction --
# sanctioned by this task's own text ("the mechanism is yours to choose").
#
# BOTTOM_SWEEP_MM: how far col_wall_bottom_l/_r's own bottom (y = -WALL_T_MM)
# inner corner sweeps away from the outlane, versus its TOP (y = 0) inner
# corner, turning that wall's inner edge from a vertical face into a
# diagonal one -- see add_bottom_wall_quad()'s own doc comment for the
# full mechanism this closes. Sized with margin past the rail's own knee
# (KNEE_DROP_MM below, whose own corner reaches ~55 mm from the true
# perimeter): 90 mm keeps col_wall_bottom_l/_r's own bottom-inner corner
# (34.9 + 90 = 124.9 mm on the left; the mirror image on the right) on the
# FAR side of the rail's own knee corner, so the two never geometrically
# overlap -- confirmed directly against the exported collision document,
# not by inspection alone.
BOTTOM_SWEEP_MM = 90.0

# CHANNEL_Y_END_MM sits comfortably inside the trough zones' own Y range
# (-80..0, sw_trough_1..4), far short of -80, so the ball's X has already
# caught up to the aperture long before its Y could run past that box.
# CHANNEL_LEFT_X_END_MM/CHANNEL_RIGHT_X_END_MM (each rail's own exit X) sit
# inside the aperture as a whole (200..314.4). Both, like DRAIN_X0_MM/
# LANE_CLEAR_MM above, are authored placeholder figures, not derived from
# any acceptance criterion.
CHANNEL_Y_END_MM = -75.0
CHANNEL_LEFT_X_END_MM = 205.0
CHANNEL_RIGHT_X_END_MM = 304.9

# KNEE_DROP_MM: how far (in both X and Y -- a 45 deg knee, matching the
# proven col_lane_deflector's own angle) the rail's first segment runs
# before bending to the shallow angle used for the rest of the channel --
# see the constants block's own rejected-design (1) above for why a bend is
# needed at all. 55 mm puts col_wall_bottom_l/_r's own unavoidable
# TOP-inner corner (34.9 mm from the true perimeter, at y = 0) well over
# two ball radii (26.99 mm) from the rail's own first-segment line, so no
# point on that segment's own face can be within one ball radius of the
# corner at the same time.
KNEE_DROP_MM = 55.0

# Story 2.1a task 25 (DW-119 residual, HIGH): col_wall_bottom_l/_r's own TOP
# edge -- the face a ball descending from up-table actually rests against --
# used to run dead flat at y = 0 across its whole ~165 mm span (outlane
# boundary to drain-aperture boundary). This solver's gravity is pure
# down-slope with NO x-component (TABLE.reference.pitchDeg tilts only the y
# axis), so a flat, x-axis-parallel face gives a resting ball zero tangential
# force in any direction -- it stops the instant it arrives and never moves
# again (measured: parked at y = 13.49-13.50 mm, one ball radius above the
# flat face, for x anywhere along the span; a 120 s run showed it creeping
# AWAY from the drain at ~0.5 mm/s if anything, not toward it). A surface
# NORMAL with an x-component is the only thing that can move a ball sideways
# under this gravity model, so the fix angles the top edge itself: it still
# starts at y = 0 at the outlane-facing end (unchanged -- this is the
# boundary the outlane geometry above already assumes), but now descends
# BOTTOM_WALL_DRAIN_DROP_MM by the drain-facing end, turning the face from a
# horizontal line into a shallow ramp whose downhill direction runs toward
# the drain aperture. A ball resting anywhere on it now has a genuine
# tangential component of gravity pulling it toward the drain end, and once
# it reaches that end it simply runs off the segment's own finite extent into
# the untouched DRAIN_X0_MM..DRAIN_X1_MM aperture -- the same mechanism the
# outlane's own gap (col_wall_bottom_l/_r starting only at OUTLANE_WIDTH_MM,
# never covering x < that) already relies on. Kept well short of the full
# WALL_T_MM (12 mm) depth so the new drain-side corner stays a real, non-
# degenerate edge clear of the wall's own bottom (y = -WALL_T_MM) edge, and
# far too small a y-excursion to reach anywhere near the below-deck return
# channel, which this task must not move (its own clearance math above
# operates on the wall's BOTTOM edge and swept inner corner, both left
# untouched here -- only the TOP edge's outer endpoint moves).
#
# Code review 2026-08-31 (iteration 4, final pass) -- THE LOWER BOUND, which
# the reasoning above does not state and which is the one that actually
# binds. Dropping the top edge does not only tilt the face: it also opens
# the throat a draining ball has to pass through between this wall and the
# AT-REST bat above it. Measured on the committed geometry, that throat is
# 27.1272 mm against a 26.99 mm reference ball -- 0.137 mm of margin, the
# tightest clearance anywhere on the game's own default ball path. Solving
# it for the drop: the at-rest left tip circle sits at table (207.33, 23.90)
# with end radius 7.5581, this wall's drain-facing top corner at (200, -d),
# so a ball fits only while sqrt(7.33^2 + (23.90 + d)^2) - 7.5581 > 26.99,
# i.e. only while **d > 9.863 mm**. The right side is the mirror image and
# gives the same figure. So 10.0 is not merely "well short of 12" -- it is
# 0.137 mm above a hard floor, and reducing it toward what the paragraph
# above would suggest is safe (5 mm, say) closes the throat below a ball
# diameter and reintroduces the DW-119 jam at the drain end of both walls.
# Both ends of that range are now pinned by tests rather than by this
# comment alone: test/asset-contract.test.ts's AC 10 dimensional gate pins
# the 10 mm drop itself, and test/flipper-sweep-clearance.test.ts's
# drain-end throat gate pins the 26.99 mm floor with a message that names
# this constant. Widening the drop instead is bounded by WALL_T_MM as
# described above.
BOTTOM_WALL_DRAIN_DROP_MM = 10.0


def octagon_points_mm(center_mm, radius_mm):
	"""Eight plan-view points approximating a circular post -- convex by
	construction (every interior angle is 135 deg), the placeholder shape for
	every rubber post this story authors."""
	cx, cy = center_mm
	return [
		(cx + radius_mm * math.cos(i * math.pi / 4), cy + radius_mm * math.sin(i * math.pi / 4))
		for i in range(8)
	]


def clear_scene():
	for obj in list(bpy.data.objects):
		bpy.data.objects.remove(obj, do_unlink=True)


def new_empty(name, location_mm, parent=None):
	obj = bpy.data.objects.new(name, None)
	obj.location = Vector((location_mm[0] * MM, location_mm[1] * MM, location_mm[2] * MM))
	obj.empty_display_size = 0.05
	obj.rotation_euler = (0.0, 0.0, 0.0)
	bpy.context.scene.collection.objects.link(obj)
	if parent is not None:
		obj.parent = parent
	return obj


def _box_bmesh(min_mm, max_mm):
	bm = bmesh.new()
	x0, y0, z0 = (v * MM for v in min_mm)
	x1, y1, z1 = (v * MM for v in max_mm)
	v000 = bm.verts.new((x0, y0, z0))
	v100 = bm.verts.new((x1, y0, z0))
	v110 = bm.verts.new((x1, y1, z0))
	v010 = bm.verts.new((x0, y1, z0))
	v001 = bm.verts.new((x0, y0, z1))
	v101 = bm.verts.new((x1, y0, z1))
	v111 = bm.verts.new((x1, y1, z1))
	v011 = bm.verts.new((x0, y1, z1))
	faces = [
		(v000, v010, v110, v100),  # -Z (bottom)
		(v001, v101, v111, v011),  # +Z (top)
		(v000, v100, v101, v001),  # -Y
		(v100, v110, v111, v101),  # +X
		(v110, v010, v011, v111),  # +Y
		(v010, v000, v001, v011),  # -X
	]
	for f in faces:
		bm.faces.new(f)
	bm.normal_update()
	return bm


def _prism_bmesh(plan_points_mm, z0_mm, z1_mm):
	"""Extrudes an arbitrary plan-view polygon (`plan_points_mm`, a list of
	`(x, y)` millimetre tuples of any length >= 3, wound in either order --
	`bm.normal_update()` below resolves the final face winding, and the
	physics loader orients every wall edge outward for itself regardless of
	source winding) between two z heights. The angled-footprint counterpart
	to `_box_bmesh()`'s fixed six-sided box: a bottom face, a top face and one
	side quad per polygon edge, built the same low-level bmesh + `bpy.data.*`
	way -- no `bpy.ops.*`, for the same headless-context reason `_box_bmesh()`
	documents."""
	bm = bmesh.new()
	z0 = z0_mm * MM
	z1 = z1_mm * MM
	bottom = [bm.verts.new((x * MM, y * MM, z0)) for x, y in plan_points_mm]
	top = [bm.verts.new((x * MM, y * MM, z1)) for x, y in plan_points_mm]
	bm.faces.new(bottom)
	bm.faces.new(reversed(top))
	count = len(plan_points_mm)
	for i in range(count):
		j = (i + 1) % count
		bm.faces.new((bottom[i], bottom[j], top[j], top[i]))
	bm.normal_update()
	return bm


def new_prism_mesh(name, plan_points_mm, z0_mm, z1_mm, parent=None):
	"""A prism mesh extruded from an arbitrary plan-view polygon -- the
	angled-footprint counterpart to `new_box_mesh()` below, sharing its
	object/mesh-datablock naming convention and creating the same `uv_base`
	UV layer so the two mesh-building paths stay consistent."""
	bm = _prism_bmesh(plan_points_mm, z0_mm, z1_mm)
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.uv_layers.new(name='uv_base')
	obj = bpy.data.objects.new(name, mesh)
	obj.data.name = name
	bpy.context.scene.collection.objects.link(obj)
	if parent is not None:
		obj.parent = parent
	return obj


def new_box_mesh(name, min_mm, max_mm, parent=None, material=None, second_uv=False):
	"""A box mesh, `name` shared by both the object and its mesh datablock
	(verified environment fact: glTF node names come from the object, glTF
	mesh names come from the mesh datablock -- naming both the same keeps the
	exported names predictable)."""
	bm = _box_bmesh(min_mm, max_mm)
	mesh = bpy.data.meshes.new(name)
	bm.to_mesh(mesh)
	bm.free()
	mesh.uv_layers.new(name='uv_base')
	if second_uv:
		mesh.uv_layers.new(name='uv_lightmap')
	if material is not None:
		mesh.materials.append(material)
	obj = bpy.data.objects.new(name, mesh)
	obj.data.name = name
	bpy.context.scene.collection.objects.link(obj)
	if parent is not None:
		obj.parent = parent
	return obj


def set_props(obj, **props):
	for key, value in props.items():
		obj[key] = value


def new_image(name, size=16, rgba=(0.6, 0.6, 0.6, 0.5)):
	"""A small generated image -- AD-11's placeholder allowance ("a small
	generated image is sufficient"); no third-party texture involved."""
	img = bpy.data.images.new(name, width=size, height=size, alpha=True)
	pixels = list(rgba) * (size * size)
	img.pixels = pixels
	img.pack()
	return img


def new_material(name, base_color=(0.55, 0.35, 0.2, 1.0), image=None, alpha_from_image=False):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	tree = mat.node_tree
	bsdf = tree.nodes.get('Principled BSDF')
	bsdf.inputs['Base Color'].default_value = base_color
	if image is not None:
		tex_node = tree.nodes.new('ShaderNodeTexImage')
		tex_node.image = image
		tex_node.label = 'translucency_mask'
		if alpha_from_image:
			tree.links.new(tex_node.outputs['Alpha'], bsdf.inputs['Alpha'])
			mat.blend_method = 'BLEND'
	return mat


def main():
	clear_scene()

	# ---- The three, and only three, top-level nodes (epics.md line 437) ----
	playfield_root = new_empty('playfield_root', (0, 0, 0))
	cabinet_root = new_empty('cabinet_root', (0, 0, 0))
	# The physical tilt hinge: the playfield's bottom-front edge, centred on X.
	pivot_pitch = new_empty('pivot_pitch', (PLAYFIELD_W_MM / 2, 0, 0))
	# cabinet_root carries no children this story (nothing cabinet-mounted is
	# in scope yet); referenced so linters do not flag it as unused.
	_ = cabinet_root

	# ---- Materials -----------------------------------------------------
	translucency_img = new_image('img_playfield_translucency')
	mat_playfield = new_material(
		'mat_playfield', base_color=(0.45, 0.30, 0.15, 1.0), image=translucency_img, alpha_from_image=True,
	)
	mat_insert = new_material('mat_insert', base_color=(0.9, 0.9, 0.95, 1.0))

	# ---- col_playfield: plane shape, real thickness, full reference dims ----
	col_playfield = new_box_mesh(
		'col_playfield',
		(0, 0, -PLAYFIELD_THICKNESS_MM), (PLAYFIELD_W_MM, PLAYFIELD_H_MM, 0),
		parent=playfield_root,
	)
	set_props(
		col_playfield,
		col_shape='plane', col_normal_z=1, surface='wood', phys_material='default',
	)

	# ---- col_glass: plane shape, facing down, above the whole playfield ----
	col_glass = new_box_mesh(
		'col_glass',
		(0, 0, GLASS_Z_MM), (PLAYFIELD_W_MM, PLAYFIELD_H_MM, GLASS_Z_MM + GLASS_THICKNESS_MM),
		parent=playfield_root,
	)
	set_props(col_glass, col_shape='plane', col_normal_z=-1, surface='glass', phys_material='default')

	# ---- Perimeter + plunger-lane walls, wall shape, with a drain gap.
	# Story 2.1b (DW-53): col_wall_left/_top/_right/_lane -- the true
	# perimeter, plus the wall separating the plunger lane from the main
	# field -- now reach PERIMETER_WALL_H_MM (the glass); col_wall_lane_bottom
	# is not a true perimeter wall (it sits below the shooter lane, well clear
	# of anywhere a ball travels above WALL_H_MM) and stays at WALL_H_MM. ----
	walls = [
		('col_wall_left', (-WALL_T_MM, 0, 0), (0, PLAYFIELD_H_MM, PERIMETER_WALL_H_MM)),
		('col_wall_top', (0, PLAYFIELD_H_MM, 0), (PLAYFIELD_W_MM, PLAYFIELD_H_MM + WALL_T_MM, PERIMETER_WALL_H_MM)),
		('col_wall_right', (PLAYFIELD_W_MM, 0, 0), (PLAYFIELD_W_MM + WALL_T_MM, PLAYFIELD_H_MM, PERIMETER_WALL_H_MM)),
		('col_wall_lane', (LANE_X0_MM, 0, 0), (LANE_X0_MM + WALL_T_MM, LANE_WALL_TOP_Y_MM, PERIMETER_WALL_H_MM)),
		('col_wall_lane_bottom', (LANE_X0_MM, -WALL_T_MM, 0), (PLAYFIELD_W_MM + WALL_T_MM, 0, WALL_H_MM)),
	]
	for name, min_mm, max_mm in walls:
		wall = new_box_mesh(name, min_mm, max_mm, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='wood', phys_material='default')

	# Story 2.1a task 22 (DW-119): col_wall_bottom_l/_r -- a gap exactly as
	# wide as the outlane directly above it, no wider (this file's own
	# Story 2.1a task-22 constants block explains why not: widening it
	# removes wall coverage a ball can rest on during ordinary gameplay well
	# outside the true outlane, reproduced directly this task's own
	# implementation pass). Each is a QUAD, not a box: its INNER
	# (outlane-side) edge sweeps BOTTOM_SWEEP_MM further away from the
	# outlane as it descends to y = -WALL_T_MM, so its own vertical face --
	# which a ball descending the return channel used to be able to reach
	# (within one ball radius in X, for any Y within one ball radius of this
	# wall's own y range -- i.e. well past y = -WALL_T_MM alone) and settle
	# into a genuine resting graze against -- no longer exists anywhere near
	# the channel at all. Found and verified this task's own implementation
	# pass: a two-segment channel rail that instead tried to simply
	# out-race this wall's OLD vertical face (a steep entrance dropping
	# clear of it before turning shallow) still failed for a release close
	# enough to the wall already at drop time (the ball never needs to
	# travel through the channel's own redirect to reach the wall's old
	# reach at all) -- removing the reachable face itself, not merely
	# out-running it, is what actually closes the defect.
	#
	# Story 2.1a task 25 (DW-119 residual, HIGH): the TOP edge -- the face a
	# ball descending from up-table actually rests against -- is no longer
	# flat. It still starts at y = 0 at the outlane-facing (inner) end,
	# unchanged, but now descends BOTTOM_WALL_DRAIN_DROP_MM by the
	# drain-facing (outer) end, so the whole span is a shallow ramp toward
	# the aperture instead of a dead-flat ledge -- see this file's own
	# constants block for why a flat face traps a ball outright under this
	# solver's x-component-free gravity, and why the drop is sized well
	# short of the full WALL_T_MM depth.
	def add_bottom_wall_quad(name, inner_x_mm, outer_x_mm, sweep_toward_mm, drain_drop_mm):
		top_inner = (inner_x_mm, 0.0)
		top_outer = (outer_x_mm, -drain_drop_mm)
		bottom_outer = (outer_x_mm, -WALL_T_MM)
		bottom_inner = (inner_x_mm + sweep_toward_mm, -WALL_T_MM)
		wall = new_prism_mesh(name, [top_inner, top_outer, bottom_outer, bottom_inner], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='wood', phys_material='default')
		return wall

	add_bottom_wall_quad('col_wall_bottom_l', OUTLANE_WIDTH_MM, DRAIN_X0_MM, BOTTOM_SWEEP_MM, BOTTOM_WALL_DRAIN_DROP_MM)
	add_bottom_wall_quad('col_wall_bottom_r', LANE_X0_MM - OUTLANE_WIDTH_MM, DRAIN_X1_MM, -BOTTOM_SWEEP_MM, BOTTOM_WALL_DRAIN_DROP_MM)

	# col_lane_deflector is retired (DW-58, this file's own header comment
	# beside DRAIN_X0_MM/DRAIN_X1_MM). The Right Loop's own upper arc, drawn
	# below, takes over its job.

	# ---- Flippers: box shape, axis-aligned so their bounding box is exactly
	# the authored bat length (unpitched, no rotation). Story 2.1a (DW-78):
	# the box is the WHOLE rubbered bat (FR-4, "3.125 in rubbered"), so it is
	# authored to extend BASE_RADIUS_MM beyond each pivot instead of ending
	# exactly at it -- the pivot sits one baseRadius in from the box's outer
	# end, matching the modelled collision body (a baseRadius circle at the
	# pivot + a flipperRadius arm + an endRadius tip) exactly, instead of the
	# base circle protruding behind authored geometry. The pivot's own
	# table-frame position (left 170.0, right 344.4) is UNCHANGED -- only the
	# box moves outward around it, which is also why the pivot SPACING here
	# stays 174.4 mm, inside the only sourced placement figure (173.0-177.8
	# mm). See src/sim/physics/loader/index.ts's loadFlipper() and this
	# story's spec Design Notes, "Why the box is the fixed side of DW-78". ----
	flipper_y0, flipper_y1 = 57.5, 82.5
	flipper_z0, flipper_z1 = 0.0, 20.0
	BASE_RADIUS_MM = (flipper_y1 - flipper_y0) / 2  # 12.5 -- half the bat's own width, the pivot's own base-circle radius
	left_pivot_x = 170.0
	right_pivot_x = PLAYFIELD_W_MM - left_pivot_x
	col_flipper_l = new_box_mesh(
		'col_flipper_l',
		(left_pivot_x - BASE_RADIUS_MM, flipper_y0, flipper_z0),
		(left_pivot_x - BASE_RADIUS_MM + FLIPPER_BAT_MM, flipper_y1, flipper_z1),
		parent=playfield_root,
	)
	set_props(col_flipper_l, col_shape='box', surface='flipper', phys_material='flipper_rubber')
	col_flipper_r = new_box_mesh(
		'col_flipper_r',
		(right_pivot_x + BASE_RADIUS_MM - FLIPPER_BAT_MM, flipper_y0, flipper_z0),
		(right_pivot_x + BASE_RADIUS_MM, flipper_y1, flipper_z1),
		parent=playfield_root,
	)
	set_props(col_flipper_r, col_shape='box', surface='flipper', phys_material='flipper_rubber')

	# ---- The drain triangle (Story 2.1a): both outlanes, both inlanes, the
	# divider guide between them, the outer guide that closes each flipper's
	# cradle-pocket throat, and a rubber post at every guide's free end. See
	# this file's constants block above for the derivation of every figure
	# here. `flipper_y_mid` is the flipper centreline both bats already share
	# (57.5..82.5), read once rather than repeating the literal. ----
	flipper_y_mid = (flipper_y0 + flipper_y1) / 2  # 70.0

	def add_guide_wall(name, x0, x1, y0, y1):
		wall = new_prism_mesh(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	def add_rubber_post(name, center_mm):
		post = new_prism_mesh(name, octagon_points_mm(center_mm, POST_RADIUS_MM), 0.0, WALL_H_MM, parent=playfield_root)
		set_props(post, col_shape='wall', surface='rubber_post', phys_material='default')
		return post

	def add_channel_rail(name, p0, p1, thickness_mm):
		"""A single thin wall whose collision edge runs exactly along the line
		p0 -> p1, extending thickness_mm further STRAIGHT DOWN (more
		negative Y, deeper below the visible playfield) rather than
		perpendicular to the line. The shallow (well under 45 deg) segments
		this file authors have a perpendicular that points mostly STRAIGHT
		UP -- offsetting that way would push the wall's own far corner back
		above its own start Y, risking overlap with whatever sits just
		above it (confirmed by inspecting the exported collision document
		for an earlier, perpendicular-offset attempt, not merely by
		inspection of the authoring code). Downward-only offsetting keeps
		the whole wall at or below the line's own y at every point, so it
		can only ever touch a neighbour at a single shared corner, never
		overlap it -- and the ball only ever meets the p0->p1 edge itself
		(export.py's wall reduction turns every footprint edge into its own
		oriented collision line, so which way the "back" of the quad
		extends does not change what the FRONT edge blocks). Always a plane
		quadrilateral (a rectangle, since the offset is a constant vector)
		-- convex by construction, the same identity-transform/angled-mesh-
		vertices technique as every other angled wall this file authors
		(col_lane_deflector, task 22's own rationale block above). NOTE:
		this rail alone does not prevent a ball from RESTING against
		col_wall_bottom_l/_r's own face in a genuine, near-stationary graze
		-- that is what add_bottom_wall_quad()'s own chamfer (this
		file's Story 2.1a task-22 constants block, BOTTOM_SWEEP_MM) exists
		to rule out; see its own comment for the mechanism, found and
		verified this task's own implementation pass by direct
		perpendicular-distance measurement against every nearby edge, not
		by assumption."""
		outer0 = (p0[0], p0[1] - thickness_mm)
		outer1 = (p1[0], p1[1] - thickness_mm)
		wall = new_prism_mesh(name, [p0, p1, outer1, outer0], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	def add_outlane_return_channel(side, points):
		"""Story 2.1a task 22 (DW-119) -- see this file's own constants block
		("the below-deck outlane return channel") for the full rationale,
		including the two rejected designs (a second, parallel rail among
		them) this single rail replaces. `points` is a list of 2+ (x, y)
		waypoints; one rail segment (add_channel_rail()) is authored between
		every consecutive pair, so the rail can bend -- here, exactly once
		(KNEE_DROP_MM), to clear col_wall_bottom_l/_r's own unavoidable TOP
		corner. A single rail does not "fully enclose" the ball the way a
		matched pair would, so its exit X is verified empirically (this
		story's own AC 7 routing test), not guaranteed by construction --
		see the constants block's own note on why that is the sanctioned
		choice here."""
		if len(points) < 2:
			raise ValueError(f'add_outlane_return_channel({side}): needs at least 2 waypoints, got {len(points)}')
		for i in range(len(points) - 1):
			# Always the INDEXED form. The un-indexed name was reachable only
			# with exactly two waypoints, so a future edit that dropped the
			# knee would silently rename every node in the committed document
			# (col_channel_l_1/_2 -> col_channel_l) and break every name-based
			# assertion with no lint or compile error. Both call sites pass
			# three waypoints, so this is byte-identical for the committed
			# artifacts (code review, 2026-08-31).
			name = f'col_channel_{side}_{i + 1}'
			add_channel_rail(name, points[i], points[i + 1], GUIDE_T_MM)

	def add_drain_triangle_side(side, tip_x, outlane_outer_wall_x, outlane_toward_wall):
		"""`outlane_toward_wall` is +1 if the outlane's outer wall sits at a
		HIGHER x than the outlane itself (the right side, against
		col_wall_lane's main-field face), else -1 (the left side, against
		col_wall_left's interior face). `toward_centre_sign` is the direction,
		from the bat's own TIP, that points further toward the playfield
		centre -- verified empirically (this story's own physics probes, not
		merely derived by inspection): the base circle at the PIVOT is
		angle-invariant (always present, full circle, regardless of stroke
		position), so a post placed close enough to combine with it forms a
		permanent trap that a held/released comparison can never
		discriminate -- AC 2's own negative control ("the same arrangement
		with the key released reaches bd_trough") would never pass. The pivot
		END of the bat is therefore the WRONG side to close (Design Notes,
		"Why the pocket closes at the tip, not the pivot"). The TIP end's
		circle, by contrast, genuinely MOVES with the stroke (it sweeps from
		the bat's own raised position, at radius flipperRadius + endRadius
		from the pivot, down to its rest position well clear of this post) --
		closing the throat there makes the pocket exist only while the flipper
		actually holds it shut."""
		toward_centre_sign = 1.0 if side == 'l' else -1.0

		# Divider guide: separates the outlane (against outlane_outer_wall_x)
		# from the inlane. Its outlane-facing face sits OUTLANE_WIDTH_MM
		# (src/sim/table/tuning.ts's outlaneWidthLeftMm/outlaneWidthRightMm)
		# from that wall.
		divider_face_x = outlane_outer_wall_x - outlane_toward_wall * OUTLANE_WIDTH_MM
		if outlane_toward_wall > 0:
			divider_x0, divider_x1 = divider_face_x - GUIDE_T_MM, divider_face_x
		else:
			divider_x0, divider_x1 = divider_face_x, divider_face_x + GUIDE_T_MM
		add_guide_wall(f'col_guide_divider_{side}', divider_x0, divider_x1, DIVIDER_Y_BOTTOM_MM, DIVIDER_Y_TOP_MM)
		divider_cx = (divider_x0 + divider_x1) / 2
		add_rubber_post(f'col_post_divider_{side}_lo', (divider_cx, DIVIDER_Y_BOTTOM_MM))
		add_rubber_post(f'col_post_divider_{side}_hi', (divider_cx, DIVIDER_Y_TOP_MM))

		# Outer guide: the inlane's own inner boundary, running down to close
		# the cradle pocket's throat just past the flipper's TIP (DW-72) --
		# see this function's own doc comment for why the tip, not the pivot.
		# Offset from the bat's own committed tip (tip_x, the box's own inner
		# edge) further toward the playfield centre and up-table, into the
		# quadrant the swept end circle's own maximum reach (radius
		# flipperRadius + endRadius from the pivot, reached only at the
		# raised end-of-stroke angle) never crosses -- verified this story's
		# own planning pass, not merely asserted.
		pocket_post_x = tip_x + toward_centre_sign * POCKET_OFFSET_ALONG_MM
		pocket_post_y = flipper_y_mid + POCKET_OFFSET_UP_MM
		outer_x0 = pocket_post_x - OUTER_GUIDE_T_MM / 2
		outer_x1 = pocket_post_x + OUTER_GUIDE_T_MM / 2
		add_guide_wall(f'col_guide_outer_{side}', outer_x0, outer_x1, pocket_post_y, GUIDE_Y_TOP_MM)
		add_rubber_post(f'col_post_pocket_{side}', (pocket_post_x, pocket_post_y))
		add_rubber_post(f'col_post_outer_{side}_hi', (pocket_post_x, GUIDE_Y_TOP_MM))

	# Left: outlane measured from col_wall_left's interior face (x = 0); tip
	# is the box's own inner edge (nearer the playfield centre).
	add_drain_triangle_side('l', left_pivot_x - BASE_RADIUS_MM + FLIPPER_BAT_MM, 0.0, -1.0)
	# Right: outlane measured from col_wall_lane's main-field face (x =
	# LANE_X0_MM) -- the plunger lane already claims the space between that
	# wall and the true right perimeter wall, so the right outlane sits
	# inboard of it rather than mirroring the left side's true-perimeter
	# anchor (this story's spec Design Notes explain the asymmetry).
	add_drain_triangle_side('r', right_pivot_x + BASE_RADIUS_MM - FLIPPER_BAT_MM, LANE_X0_MM, 1.0)

	# Story 2.1a task 22 (DW-119): the below-deck return channel that makes
	# each outlane actually reach bd_trough -- see the constants block above
	# ("the below-deck outlane return channel") for the rationale and the
	# two rejected designs (a second, parallel rail among them) this single-
	# rail-per-side shape replaces. Each rail bends once, KNEE_DROP_MM short
	# in both X and Y (steep enough -- dx = dy, the same 45 deg
	# col_lane_deflector's own proven deflector already uses -- that
	# col_wall_bottom_l/_r's own unavoidable TOP corner clears two ball
	# radii from this first segment's own line, so no point on the rail's
	# own face can be within one ball radius of that corner at the same
	# time), then continues at the SAME shallow angle used throughout this
	# file, proven safe in isolation once nothing else is nearby (this
	# task's own diagnostic: col_wall_bottom_l temporarily moved out of
	# reach, the shallow angle alone carried the ball to the aperture
	# cleanly). Both exits land inside the SAME untouched drain aperture,
	# split left/right of its own centre.
	def build_channel_rail_points(gap_x_mm, toward_centre_sign, exit_x_mm):
		"""toward_centre_sign is +1 if the centre (and therefore every
		subsequent waypoint) lies at HIGHER x than gap_x_mm (the left side),
		else -1 (the right side)."""
		p0 = (gap_x_mm, -WALL_T_MM)
		knee = (gap_x_mm + toward_centre_sign * KNEE_DROP_MM, -WALL_T_MM - KNEE_DROP_MM)
		exit_point = (exit_x_mm, CHANNEL_Y_END_MM)
		return [p0, knee, exit_point]

	add_outlane_return_channel('l', build_channel_rail_points(0.0, 1.0, CHANNEL_LEFT_X_END_MM))
	add_outlane_return_channel('r', build_channel_rail_points(LANE_X0_MM, -1.0, CHANNEL_RIGHT_X_END_MM))

	# =========================================================================
	# Story 2.1b -- the rest of the shot map, above GUIDE_Y_TOP_MM = 420. Every
	# figure is authored (see this file's own Story 2.1b constants block,
	# above, for the full provenance discipline). Insertion point per the
	# spec's own Code Map: after the drain triangle and its below-deck return
	# channels, before the switch-zone block.
	# =========================================================================

	def add_box_wall(name, x0, x1, y0, y1, surface):
		"""A rectangular col_ 'wall' node spanning z in [0, WALL_H_MM] -- the
		shared shape every interior guide, target face, divider and gate body
		this story draws is built from (col_guide_divider_l/r's own prototype,
		2.1a's add_guide_wall(), generalised over `surface` so this story's
		many surface classes -- 'dragon', 'target', 'ramp', 'rubber_band',
		'bumper', 'plastic' -- share one call site)."""
		wall = new_prism_mesh(name, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface=surface, phys_material='default')
		return wall

	# Rework iteration 2 (2026-09-01 lead investigation): eleven bodies this
	# story drew as plain add_box_wall() rectangles trap a ball permanently --
	# confirmed frozen to 0.1 mm at 120000 ticks -- because a plain rectangle's
	# north (y1) edge is exactly perpendicular to this solver's gravity (pure
	# down-slope, NO x-component -- 2.1a's own Design Notes), so a ball
	# resting against that face experiences zero tangential force in any
	# direction and never moves again. This is VERBATIM the DW-119 defect
	# 2.1a already fixed on col_wall_bottom_l/_r (this file's own
	# BOTTOM_WALL_DRAIN_DROP_MM block, above): angling the ball-contact face
	# itself -- so its outward normal gains an x-component -- is the only fix
	# that works under this gravity model, because it stops fully cancelling
	# gravity's y-component and gives a resting ball both a genuine sideways
	# AND a genuine downward pull along the face, rather than merely
	# "bevelling a corner" cosmetically. add_box_wall_sloped() generalises
	# that same mechanism (one north corner lowered by drop_mm, the other
	# left at the full y1) to every flat-topped body the rework identified;
	# every call site below states, in its own comment, which side the ball
	# is meant to slide toward and why.
	def add_box_wall_sloped(name, x0, x1, y0, y1, surface, drop_mm, drop_corner):
		if drop_corner == 'x0':
			points = [(x0, y0), (x1, y0), (x1, y1), (x0, y1 - drop_mm)]
		elif drop_corner == 'x1':
			points = [(x0, y0), (x1, y0), (x1, y1 - drop_mm), (x0, y1)]
		else:
			raise ValueError(f"add_box_wall_sloped({name}): drop_corner must be 'x0' or 'x1', got {drop_corner!r}")
		wall = new_prism_mesh(name, points, 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface=surface, phys_material='default')
		return wall

	# ---- Left and Right Loops (task 3, CAP-26): a chain of convex prisms
	# from the two EXISTING col_post_divider_*_hi posts (2.1a, y = 420) up
	# each side of the table and across the top, so a full orbit passes both
	# (LOOP_LANE_CLEAR_MM wide once past the funnel; the perimeter walls --
	# col_wall_left/_top, and col_wall_lane on the right, LANE_X0_MM's own
	# face -- are the loop's OUTER boundary, the same one-wall-plus-perimeter
	# shape 2.1a's own outlane/inlane divider uses, so only the INNER guide is
	# drawn here). Both free ends terminate at the existing rubber posts --
	# no new post is needed at the bottom, and the guide never has a free end
	# at the top, because the two sides join across the top connector. ----
	# Story 2.1c -- the funnel is now the lane's INNER rail bending outboard
	# to the inlane, not a taper back onto the outlane. Two convex quads per
	# side (this one and col_guide_inlane_*), joined at a rubber post, because
	# a single body with the bend in it would not be convex (export.py:434-440
	# fails naming the node and the dropped vertices).
	def add_loop_funnel(name, loop_x0, loop_x1, mouth_x0, mouth_x1):
		"""The trapezoid carrying the loop's own inner rail from its straight
		run (LOOP_LANE_CLEAR_MM off the perimeter, at y = LOOP_FUNNEL_Y1_MM)
		out to the inlane guide's own line (at y = LOOP_FUNNEL_Y0_MM). Its
		outer face is what turns an ASCENDING shot -- entering the mouth over
		the inlane -- back into the lane; its inner face is the inlane's own
		upper wall."""
		points = [
			(loop_x0, LOOP_FUNNEL_Y1_MM), (loop_x1, LOOP_FUNNEL_Y1_MM),
			(mouth_x1, LOOP_FUNNEL_Y0_MM), (mouth_x0, LOOP_FUNNEL_Y0_MM),
		]
		wall = new_prism_mesh(name, points, 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	# Story 2.1c -- the loop RETURN rail (see LOOP_RETURN_TOP_Y_MM's own
	# derivation in the constants block). A plank across the lane, high end on
	# the perimeter wall, low end above the divider guide's own outer face.
	# The inboard end TAPERS TO A POINT rather than closing with a
	# perpendicular end face. Measured, not styled: with a 12 mm end face at
	# x = 34.9 the ball SHOT into the lane -- which arrives travelling up and
	# inboard, the only direction a real flipper shot can take toward a lane
	# this far off the flipper's own axis -- struck that face head-on and lost
	# 87% of its speed (traced: (-1024, +1118) mm/s in, (+306, +803) out, then
	# a second contact on the funnel, peak height 492 mm against the 1016.8 mm
	# the lane needs). A tapered end presents only the rail's own north face
	# to that ball, which it grazes and rides. Nothing about the DESCENT
	# changes: the descending ball slides down that same north face and leaves
	# at the tip either way.
	def add_loop_return_rail(name, wall_x, end_x):
		points = [
			(wall_x, LOOP_RETURN_TOP_Y_MM),
			(end_x, LOOP_RETURN_END_Y_MM),
			(wall_x, LOOP_RETURN_TOP_Y_MM - GUIDE_T_MM),
		]
		wall = new_prism_mesh(name, points, 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	# Story 2.1c -- the inlane's own inner guide and the feed ramp that
	# carries an arriving ball onto the bat. Both are col_guide_* nodes and
	# both terminate at rubber posts at their two free ends, per Story 2.1a
	# AC 1 -- test/asset-contract.test.ts's own end-derivation is generalised
	# in the same pass from "bbox y-extremes at the x centreline" (true only
	# of a straight, axis-aligned, y-running prism) to "the midpoints of the
	# footprint's own two shortest edges", which reproduces the old answer
	# exactly for every guide 2.1a drew and is correct for an angled one too.
	def add_inlane_guide(name, x0, x1):
		wall = add_box_wall(name, x0, x1, INLANE_GUIDE_Y0_MM, LOOP_FUNNEL_Y0_MM - GUIDE_T_MM / 2 - POST_RADIUS_MM, 'plastic')
		return wall

	def add_inlane_feed(name, x_inlane, y_inlane, x_bat, y_bat):
		points = [
			(x_inlane, y_inlane),
			(x_bat, y_bat),
			(x_bat, y_bat - GUIDE_T_MM),
			(x_inlane, y_inlane - GUIDE_T_MM),
		]
		wall = new_prism_mesh(name, points, 0.0, WALL_H_MM, parent=playfield_root)
		set_props(wall, col_shape='wall', surface='plastic', phys_material='default')
		return wall

	# Left: the 2.1a divider guide's own span is x in [OUTLANE_WIDTH_MM,
	# OUTLANE_WIDTH_MM + GUIDE_T_MM] = [34.9, 46.9]; the loop's own
	# lane-facing face sits LOOP_LANE_CLEAR_MM from col_wall_left's interior
	# face (x = 0).
	left_divider_x0, left_divider_x1 = OUTLANE_WIDTH_MM, OUTLANE_WIDTH_MM + GUIDE_T_MM
	loop_l_x0, loop_l_x1 = LOOP_LANE_CLEAR_MM, LOOP_LANE_CLEAR_MM + GUIDE_T_MM
	inlane_l_x0 = loop_l_x0 + LOOP_FUNNEL_OFFSET_MM
	inlane_l_x1 = inlane_l_x0 + GUIDE_T_MM
	add_loop_funnel('col_loop_l_funnel', loop_l_x0, loop_l_x1, inlane_l_x0, inlane_l_x1)
	add_box_wall('col_loop_l', loop_l_x0, loop_l_x1, LOOP_FUNNEL_Y1_MM, LOOP_TOP_INNER_Y_MM - GUIDE_T_MM, 'plastic')
	add_loop_return_rail('col_loop_l_return', 0.0, LOOP_RETURN_END_X_MM)
	add_inlane_guide('col_guide_inlane_l', inlane_l_x0, inlane_l_x1)
	add_inlane_feed('col_guide_inlane_feed_l', INLANE_FEED_L_X0_MM, INLANE_FEED_Y0_MM, INLANE_FEED_L_X1_MM, INLANE_FEED_Y1_MM)

	# Right: the 2.1a divider guide's own span is x in [LANE_X0_MM -
	# OUTLANE_WIDTH_MM - GUIDE_T_MM, LANE_X0_MM - OUTLANE_WIDTH_MM] =
	# [421.5, 433.5]; the loop's own lane-facing face sits LOOP_LANE_CLEAR_MM
	# from col_wall_lane's main-field face (x = LANE_X0_MM = 468.4), the same
	# asymmetric anchor 2.1a's own add_drain_triangle_side() uses for the
	# right outlane.
	right_divider_x1 = LANE_X0_MM - OUTLANE_WIDTH_MM
	right_divider_x0 = right_divider_x1 - GUIDE_T_MM
	loop_r_x1 = LANE_X0_MM - LOOP_LANE_CLEAR_MM
	loop_r_x0 = loop_r_x1 - GUIDE_T_MM
	inlane_r_x1 = loop_r_x1 - LOOP_FUNNEL_OFFSET_MM
	inlane_r_x0 = inlane_r_x1 - GUIDE_T_MM
	add_loop_funnel('col_loop_r_funnel', loop_r_x1, loop_r_x0, inlane_r_x1, inlane_r_x0)
	# Split at the Ramp's own return crossing (see RAMP_RETURN_GAP_Y0_MM).
	add_box_wall('col_loop_r', loop_r_x0, loop_r_x1, RAMP_RETURN_GAP_Y1_MM, LOOP_TOP_INNER_Y_MM - GUIDE_T_MM, 'plastic')
	# Sloped toward the lane (x1): a ball the Ramp's own crossing drops short
	# would otherwise rest on this cap's dead-flat north face (DW-119).
	add_box_wall_sloped('col_loop_r_lower', loop_r_x0, loop_r_x1, LOOP_FUNNEL_Y1_MM, RAMP_RETURN_GAP_Y0_MM, 'plastic', 6.0, 'x1')
	add_loop_return_rail('col_loop_r_return', LANE_X0_MM, LANE_X0_MM - LOOP_RETURN_END_X_MM)
	add_inlane_guide('col_guide_inlane_r', inlane_r_x0, inlane_r_x1)
	add_inlane_feed('col_guide_inlane_feed_r', INLANE_FEED_R_X0_MM, INLANE_FEED_Y0_MM, INLANE_FEED_R_X1_MM, INLANE_FEED_R_Y1_MM)

	# Every free end of the four new col_guide_* nodes terminates at a rubber
	# post, the same POST_RADIUS_MM octagon 2.1a's own guides use.
	for _name, _cx, _cy in (
		('col_post_inlane_l_hi', (inlane_l_x0 + inlane_l_x1) / 2, LOOP_FUNNEL_Y0_MM - GUIDE_T_MM / 2),
		('col_post_inlane_l_lo', (inlane_l_x0 + inlane_l_x1) / 2, INLANE_GUIDE_Y0_MM),
		('col_post_inlane_r_hi', (inlane_r_x0 + inlane_r_x1) / 2, LOOP_FUNNEL_Y0_MM - GUIDE_T_MM / 2),
		('col_post_inlane_r_lo', (inlane_r_x0 + inlane_r_x1) / 2, INLANE_GUIDE_Y0_MM),
		('col_post_feed_l_hi', INLANE_FEED_L_X0_MM, INLANE_FEED_Y0_MM - GUIDE_T_MM / 2),
		('col_post_feed_l_lo', INLANE_FEED_L_X1_MM, INLANE_FEED_Y1_MM - GUIDE_T_MM / 2),
		('col_post_feed_r_hi', INLANE_FEED_R_X0_MM, INLANE_FEED_Y0_MM - GUIDE_T_MM / 2),
		('col_post_feed_r_lo', INLANE_FEED_R_X1_MM, INLANE_FEED_R_Y1_MM - GUIDE_T_MM / 2),
	):
		add_rubber_post(_name, (_cx, _cy))

	# Top connector (task 3) -- Story 2.1c, DW-123: RE-JOINED to col_loop_l.
	# 2.1b shortened this wall's left end from x = 40 to x = 220 because a
	# plunged ball rides its north face to whichever end it reaches, and the
	# Left Loop's own lane then discharged into the left OUTLANE. That
	# discharge is fixed below (col_loop_l_funnel now feeds the left inlane),
	# so the two changes land together exactly as the story requires: the
	# wall is restored to its full span and a ball that rides it off either
	# end drops into a lane that returns it playable.
	#
	# [REWORK 2026-09-03, code review pass 2 MED finding] This face used to be
	# left dead FLAT, on the argument that the orbit crosses it in BOTH
	# directions -- west-bound for a Right Loop shot, east-bound for a Left
	# Loop shot -- so a single-direction slope (add_box_wall_sloped()) would
	# help one orbit and fight the other, and that "nothing lands on it at
	# rest" because every ball reaches it already carrying crossing speed.
	# That second claim was argued, not tested -- test/shot-routing.test.ts's
	# own descending-release sweep never dropped a ball directly onto it, and
	# once it did (this rework's own new column), a ball released at rest
	# anywhere on the flat span settled permanently, x unchanged to the
	# 5th decimal (no x-gravity, so a flat face imparts genuinely ZERO
	# tangential force) -- the exact DW-119 shape this project has been bitten
	# by three times before.
	#
	# Fix (Edge Case Hunter's own suggested remedy, code review pass 2): a
	# RIDGE, not a single-direction slope -- both halves slope DOWN AWAY from
	# the midpoint, so either crossing direction still runs slightly downhill
	# toward its own far end, and a ball at rest ANYWHERE on the span (other
	# than the exact peak, an unstable equilibrium under this solver's
	# x-free gravity, same as a ball balanced on a knife-edge) rolls off
	# toward whichever lane is nearer. A single convex 5-point prism (SW, SE
	# flat on the south face, unchanged; NE and NW each RIDGE_DROP_MM below
	# the peak; the peak itself at the midpoint) -- verified convex by hand
	# (every consecutive edge-pair cross product has the same sign) and by
	# export.py's own validate_col_shapes() at export time.
	#
	# RIDGE_DROP_MM was swept against the real physics pipeline, not guessed:
	# 5.0 mm (this file's own Ramp-cap convention) DOES fix the stranding
	# (both new descending-release columns make genuine positional progress)
	# but is steep enough to matter to a crossing ball too -- measured, it
	# retimes the Left Loop's own 34 mm entry offset just enough that the
	# ball lands in the RIGHT OUTLANE instead of the right inlane, a genuine
	# regression in the orbit's own delivery this rework exists to protect.
	# Swept 5.0 / 3.0 / 2.5 / 2.0 / 1.5 / 1.0 / 0.5 mm: every value from 3.0
	# down still fixes the strand (100+ mm of positional progress at both
	# drop columns, against the >15 mm floor), and every value from 3.0 down
	# ALSO preserves all six standard entry offsets (both Loops x
	# LOOP_ENTRY_OFFSETS_MM, each verified individually) delivering to their
	# own opposite inlane. 2.5 mm is the shipped value -- comfortably inside
	# both safe ranges, over each half's own ~184 mm run a ~0.8 deg grade,
	# imperceptible to a ball arriving at >= 1100 mm/s crossing speed but
	# enough that a ball genuinely at rest is never in equilibrium except at
	# the single peak point. Re-verified against the real physics pipeline
	# after settling on this value: both new descending-release columns
	# (west and east of the peak) make genuine positional progress instead
	# of parking; every existing orbit case (both Loops, all three entry
	# offsets, the DW-123 single-ball case, the off-column sweep, the
	# below-2200 mm/s case) passes unchanged.
	loop_top_peak_x = (LOOP_TOP_END_X_MM + (LANE_X0_MM - LOOP_TOP_END_X_MM)) / 2
	RIDGE_DROP_MM = 2.5
	col_loop_top = new_prism_mesh(
		'col_loop_top',
		[
			(LOOP_TOP_END_X_MM, LOOP_TOP_INNER_Y_MM - GUIDE_T_MM),
			(LANE_X0_MM - LOOP_TOP_END_X_MM, LOOP_TOP_INNER_Y_MM - GUIDE_T_MM),
			(LANE_X0_MM - LOOP_TOP_END_X_MM, LOOP_TOP_INNER_Y_MM - RIDGE_DROP_MM),
			(loop_top_peak_x, LOOP_TOP_INNER_Y_MM),
			(LOOP_TOP_END_X_MM, LOOP_TOP_INNER_Y_MM - RIDGE_DROP_MM),
		],
		0.0, WALL_H_MM,
		parent=playfield_root,
	)
	set_props(col_loop_top, col_shape='wall', surface='plastic', phys_material='default')

	# Story 2.1c -- the orbit's own top turn (see LOOP_TURN_ANGLE_DEG's own
	# derivation in the constants block). One angled prism per lane, tucked
	# into that lane's own top corner against the perimeter wall it runs
	# against, with the low corner at LOOP_TURN_LOW_Y_MM and the high corner
	# meeting col_wall_top's own interior face. The ball climbing the lane
	# strikes the hypotenuse -- a CEILING, whose outward normal points down
	# and inboard, so gravity can never rest a ball against it (only a north
	# face traps, DW-119) -- and leaves it travelling across the table at
	# ~98.5% of its climb speed, landing on col_loop_top's own north face and
	# riding it to the far lane.
	loop_turn_run_mm = (PLAYFIELD_H_MM - LOOP_TURN_LOW_Y_MM) / math.tan(math.radians(LOOP_TURN_ANGLE_DEG))
	col_loop_turn_l = new_prism_mesh(
		'col_loop_turn_l',
		[
			(0.0, LOOP_TURN_LOW_Y_MM),
			(loop_turn_run_mm, PLAYFIELD_H_MM),
			(0.0, PLAYFIELD_H_MM),
		],
		0.0, WALL_H_MM,
		parent=playfield_root,
	)
	set_props(col_loop_turn_l, col_shape='wall', surface='plastic', phys_material='default')
	# The right turn is anchored east to col_wall_lane's own OUTER face
	# (LANE_X0_MM + WALL_T_MM) rather than left free-standing at the lane's
	# own inner face: col_wall_lane itself stops at LANE_WALL_TOP_Y_MM = 950,
	# so a prism ending at 468.4 would leave a bare vertical edge in open
	# field. The extra 12 mm is pure ceiling, above the plunge path (the
	# plunged ball is turned by col_loop_r_deflector at y ~968, measured, and
	# is already travelling west well before it reaches this height).
	col_loop_turn_r = new_prism_mesh(
		'col_loop_turn_r',
		[
			(LANE_X0_MM, LOOP_TURN_LOW_Y_MM),
			(LANE_X0_MM + WALL_T_MM, LOOP_TURN_LOW_Y_MM),
			(LANE_X0_MM + WALL_T_MM, PLAYFIELD_H_MM),
			(LANE_X0_MM - loop_turn_run_mm, PLAYFIELD_H_MM),
		],
		0.0, WALL_H_MM,
		parent=playfield_root,
	)
	set_props(col_loop_turn_r, col_shape='wall', surface='plastic', phys_material='default')

	# Spinner gate (task 4, Left Loop only -- SPEC CAP-26, machine-
	# behaviour.md:72): a thin stub protruding from the loop guide's own
	# inner face, narrow enough that the reference ball still clears the
	# remaining lane width comfortably (see this file's constants block). No
	# revolution counting here -- Story 2.3 owns the mechanical spin.
	# Story 2.1c: the stub moves from the loop guide's own inner face to the
	# PERIMETER wall's face -- same lane, other side. Measured reason: with
	# the orbit landing, the lane now carries a ball in both directions, and
	# they use opposite sides of it (the shot climbs the inboard column, x
	# 30.5..36.5, because the return rail below claims everything west of
	# 30.5). A stub protruding from the inboard face put 12 mm of solid
	# directly in the shot's own column -- traced: every Left Loop entry
	# offset stalled against it at y = 632, against the 1016.8 mm the lane
	# needs. On the perimeter face the shot climbs clear.
	#
	# [FLAGGED 2026-09-03, code review -- the claim removed from the two lines
	# above was measured FALSE by this story's own review pass, and the
	# retraction reached docs/feel-test.md but not this comment.] It read "it
	# sits in the RETURN's column instead, where the descending ball meets it
	# on every orbit (s_spinner closes on the pass, measured)". Measured
	# against the committed document, NEITHER direction touches this body:
	# the ascending shot's column is x 27.5..36.5, so its west surface is at
	# x >= 14.005 against this stub's east face at SPINNER_PROTRUDE_MM = 12
	# (2.5 mm clear at the closest offset), and the orbit's DESCENT falls at
	# x = 52.0..52.3 (traced per tick, every offset), 40 mm clear. s_spinner
	# still closes on a Left Loop shot only because sw_spinner is an analytic
	# zone (x 5..45, y 635..662, authored from bare literals below and NOT
	# moved by this story) that the ball crosses without contact -- AD-11's
	# "a sw_ zone is a test against the swept segment, not a contact".
	# Demonstrated at code review: DELETING col_spinner_l from the committed
	# collision document leaves all three Left Loop orbit cases GREEN,
	# including the s_spinner assertion added to pin this relocation. So the
	# stub is currently dead geometry and Story 2.3's mechanical spin has
	# nothing to spin. Routed to rework rather than patched here: putting it
	# back in a ball's path is a lane-budget decision (it was moved off the
	# inboard face precisely because it blocked the shot), needs a re-export,
	# and moves every golden's assetHash.
	#
	# [REWORK ATTEMPTED AND HALTED 2026-09-03, code review pass 2] Both
	# candidate paths were tried against the real physics pipeline (a
	# throwaway in-memory collision-doc patch + driveShot()/runReplay()
	# harness, never committed): the ASCENDING shot's own column (x
	# 27.5..36.5, this story's own 9 mm load-bearing entry band) and the
	# orbit's DESCENDING return (x ~52.2..52.3, the SAME column the
	# golden-pinned plunge, AC 4, rides through -- confirmed by tracing
	# roll-and-drain's own transitions-stripped path). Thirteen-plus shapes
	# swept in the descending column alone -- a plain box at several widths,
	# an add_box_wall_sloped() bevel in BOTH directions, a full-height
	# vertical wall, and a small octagonal rubber_post-style stub down to
	# 1 mm radius -- and every one that genuinely contacts the ball's own
	# body (not merely its centre-line) produces a permanent stall: zero
	# further x-progress, the DW-119 shape, even at the shallowest overlap
	# tested. The ascending column (already proven fragile: a 12 mm stub
	# there previously stalled every entry offset, which is WHY the stub
	# moved to the perimeter face in the first place) was not re-attempted
	# beyond confirming a thin post there reverses the shot outright instead
	# of grazing it. HALTED rather than forced, per the spec's own
	# instruction for exactly this shape of conflict -- col_spinner_l remains
	# dead geometry. Ledgered as DW-135 (Story 2.3's own mechanical-spin
	# story needs a different mechanism than a static collision stub in
	# either of this lane's two ball paths -- a compliant/hinged spinner
	# simulation, or a location this investigation did not test).
	#
	# [RESOLVED 2026-09-03 -- AD-6 AMENDED; author's decision on the
	# runner's Clarification] The premise above is corrected, not waived.
	# prd.md:71 puts the Spinner on one of the two Loops while AD-6 used
	# to require it to spin "from ball contact"; on this geometry both
	# cannot hold, and the thirteen-plus stalls above are WHY. A real
	# spinner is a freely-rotating GATE the ball passes THROUGH, not an
	# obstacle it strikes -- so AD-6's Rule now reads pass-through: a ball
	# crossing sw_spinner's zone imparts rotation proportional to entry
	# speed and closes s_spinner once per revolution until it decays
	# (FR-26 awards per rotation). The analytic swept-segment zone
	# (AD-11) is therefore the CORRECT model, not a workaround, and every
	# variant above was failing for the right reason. This body is now
	# INTENTIONALLY non-colliding, so the code-review finding is closed
	# by-design rather than high_waived. Story 2.3 owns the spin/decay
	# mechanism, driven off the zone crossing.
	#
	# [RENAMED 2026-09-03, Story 2.1d task 10] col_spinner_l -> vis_spinner_l.
	# A node nothing collides with is not col_ under AD-11's prefix contract
	# ("A node nothing collides with is not col_ under AD-11's prefix
	# contract, so col_spinner_l is renamed vis_spinner_l in the
	# device-behaviour story, batched with bd_lock's golden re-record
	# because either change alone moves assetHash" -- AD-6, amended). The
	# rename is NOT a plain in-place name change: export.py's own
	# is_presentation_object() (`not (col_ or sw_)`) routes a `vis_` node
	# through THREE static-mesh contracts add_box_wall()'s own
	# new_prism_mesh() supplies none of: a second UV layer
	# (validate_second_uv(), AD-12's TEXCOORD_1), a lightgroup
	# (validate_exported_mesh_contract()) and exactly one material slot
	# (validate_material_slots()) -- so this is re-authored through
	# new_box_mesh(..., material=..., second_uv=True) plus
	# set_props(lightgroup=...), the SAME pattern vis_playfield (below) uses,
	# rather than a bare rename of add_box_wall()'s own call site. Still
	# INTENTIONALLY non-colliding (AD-6, amended) and still absent from
	# dragonwar.collision.json (export.py:447-451 excludes every `vis_`
	# node from the collision document by the same prefix predicate). No
	# spin or decay mechanism -- Story 2.3 owns that, driven off
	# sw_spinner's own zone crossing, which stays byte-identical (x 5..45,
	# y 635..662, authored from bare literals below and untouched here).
	mat_spinner = new_material('mat_spinner', base_color=(0.65, 0.65, 0.7, 1.0))
	vis_spinner_l = new_box_mesh(
		'vis_spinner_l',
		(0.0, SPINNER_Y_MM - 3.0, 0.0), (SPINNER_PROTRUDE_MM, SPINNER_Y_MM + 3.0, WALL_H_MM),
		parent=playfield_root, material=mat_spinner, second_uv=True,
	)
	set_props(vis_spinner_l, lightgroup='lg_playfield')

	# DW-58's own consequence, verified empirically (this story's own planning
	# pass, not merely derived by inspection): gravity has no x-component
	# (2.1a's own Design Notes), so a ball launched dead straight up the
	# plunger lane carries NO lateral drift at all -- open space alone past
	# LANE_WALL_TOP_Y_MM does not "turn the ball into the field"; it needs an
	# actual angled surface to deflect it sideways, exactly the job the
	# retired col_lane_deflector did. The Right Loop's own upper arc supplies
	# that surface -- an angled prism at the plunger lane's own top, authored
	# as part of the loop rather than a standalone node, so DW-58's own claim
	# ("the Right Loop's own upper arc turns the launched ball into the
	# field") is genuinely true rather than merely asserted.
	#
	# Rework iteration 3 (author's answer A, DW-121's sibling finding): the
	# ORIGINAL hypotenuse here (a 45 deg angle, geometrically the retired
	# col_lane_deflector's own proven angle) does deflect the ball sideways,
	# but not steeply enough -- measured this story's own rework-iteration-2
	# pass, a plunged ball's post-deflection velocity retained too little of
	# its climb (+331 mm/s in Y against -736 mm/s in X) to clear the Right
	# Loop's own entrance (col_loop_top's reach in x, up to
	# 428.4 + BALL_RADIUS_MM) before its Y had already fallen back into that
	# wall's own y-reach -- the ball caught col_loop_top's top-right corner
	# instead of clearing it, and rattled in the Loop's own pocket for
	# ~1300 ticks before falling back into the right outlane, never once
	# reaching the flipper band. This is now a genuinely STEEPER hypotenuse
	# (PLUNGE_DEFLECTOR_DROP_MM = 50 mm over the same 34 mm run, theta =
	# 55.8 deg -- see that constant's own comment for the closed-form
	# derivation from this solver's measured contact response, AND for why
	# an even steeper 85 mm / 68.2 deg was tried first and rejected), which
	# retains far more of the climb (measured against the regenerated
	# document, this story's own trace: post-deflection velocity
	# (-716, +644) mm/s, against the original 45 deg angle's own
	# (-736, +331) mm/s), clearing the Right Loop's own entrance with margin
	# and, empirically, crossing the whole table and descending the left
	# side onto the left flipper -- see this story's own Spec Change Log /
	# rework report for the measured trace (max Y, flipper-band ticks,
	# closest approach to the left bat) this angle was chosen against.
	# Identity object transform, angled mesh vertices -- the same technique
	# the retired node proved.
	col_loop_r_deflector = new_prism_mesh(
		'col_loop_r_deflector',
		[
			(LANE_X0_MM + WALL_T_MM, LOOP_TOP_INNER_Y_MM),
			(PLAYFIELD_W_MM, LOOP_TOP_INNER_Y_MM - PLUNGE_DEFLECTOR_DROP_MM),
			(PLAYFIELD_W_MM, LOOP_TOP_INNER_Y_MM),
		],
		0.0, WALL_H_MM,
		parent=playfield_root,
	)
	set_props(col_loop_r_deflector, col_shape='wall', surface='wood', phys_material='default')

	# ---- Ramp (task 5): entrance right of centre (> PLAYFIELD_W_MM / 2 =
	# 257.2) so the LEFT flipper shoots it (FR-27; the return-inlane choice
	# is recorded in docs/decisions.md, OQ-6). No sloped-plane primitive
	# exists in this collision model (this file's constants block explains
	# why), so the bed is an ordinary deck-height channel, surface='ramp' for
	# the contact-sound channel only. Nothing crosses the plunger lane
	# (LANE_X0_MM = 468.4): the whole channel and its return rail stay well
	# under x = 400, clear of it and of the Right Loop's own lane. ----
	ramp_lane_x0 = RAMP_ENTER_X_MM - RAMP_LANE_CLEAR_MM / 2
	ramp_lane_x1 = RAMP_ENTER_X_MM + RAMP_LANE_CLEAR_MM / 2
	# Rework iteration 2 (DW-119-class fix): col_ramp_wall_l's own north end
	# -- the top of its 12 mm-wide side rail, at RAMP_TOP_Y_MM -- used to be a
	# dead-flat cap and stranded a ball at y = 838.5 (measured evidence).
	# col_ramp_wall_r needs no equivalent fix: its own north end is exactly
	# where the return rail (col_ramp_return_1, below) begins, so a ball
	# reaching it is already caught by that rail rather than resting on a
	# flat cap. Sloped toward the channel's OWN inner face (x1, the side
	# facing ramp_lane_x0) so a ball stranded there drops back down into the
	# open channel it climbed, rather than out toward the perimeter.
	# Story 2.1c review fix: this call regressed to drop_corner='x0' (which
	# drops the LOW, OUTER/perimeter-side corner -- see add_box_wall_sloped()'s
	# own points construction -- sending a stranded ball toward the perimeter,
	# exactly backwards from the comment above and from col_ramp_wall_l's
	# pre-2.1c, correct behaviour). 'x1' (this wall's own inner/channel-facing
	# edge, at ramp_lane_x0) restores the documented, correct slope.
	add_box_wall_sloped('col_ramp_wall_l', ramp_lane_x0 - WALL_T_MM, ramp_lane_x0, RAMP_ENTER_Y_MM, RAMP_TOP_Y_MM, 'ramp', 5.0, 'x1')
	# Story 2.1c task 9: col_ramp_wall_r's own north cap WAS dead flat, and
	# the pin's own descending-release sweep proved it strands a ball there
	# (Phase 1 red case 6: 0.00 mm of net progress over 6600 ticks, parked at
	# y = 838.50). The old comment beside it argued the return rail caught
	# such a ball first; the return rail did not reach it. Sloped toward the
	# channel (x0) like col_ramp_wall_l, so a ball resting there drops back
	# into the channel it climbed.
	add_box_wall_sloped('col_ramp_wall_r', ramp_lane_x1, ramp_lane_x1 + WALL_T_MM, RAMP_ENTER_Y_MM, RAMP_WALL_R_TOP_Y_MM, 'ramp', 5.0, 'x0')

	# The Ramp's own top turn (see RAMP_TURN_Y0_MM). Low corner on the
	# channel's WEST side so the reflection sends the ball EAST, across the
	# Right Loop's rail and into its lane.
	col_ramp_turn = new_prism_mesh(
		'col_ramp_turn',
		[
			(ramp_lane_x0, RAMP_TURN_Y0_MM),
			(loop_r_x0, RAMP_TURN_Y0_MM + (loop_r_x0 - ramp_lane_x0)),
			(loop_r_x0, RAMP_TURN_Y0_MM + (loop_r_x0 - ramp_lane_x0) + 26.0),
			(ramp_lane_x0, RAMP_TURN_Y0_MM + (loop_r_x0 - ramp_lane_x0) + 6.0),
		],
		0.0, WALL_H_MM,
		parent=playfield_root,
	)
	set_props(col_ramp_turn, col_shape='wall', surface='ramp', phys_material='default')

	# Return rail: a single bent rail, the exact add_channel_rail() technique
	# 2.1a's own outlane return channel proved, from the top of the
	# up-channel down into the RIGHT inlane -- landing well clear of both the
	# Right Loop's own lane and the right slingshot.
	# Story 2.1c task 5 -- redrawn. One rail, from the top of the Ramp's own
	# east wall across the gap in the Right Loop's rail and into the loop
	# lane's own bottom, which is the only approach the right inlane has
	# (see RAMP_RETURN_GAP_Y0_MM's own note). A ball leaving the rail's east
	# end descends that lane, passes east of col_loop_r_funnel and lands in
	# sw_inlane_r, then on col_guide_inlane_feed_r and onto the right bat --
	# OQ-6/FR-27's decided right-inlane return, delivered.
	add_channel_rail(
		'col_ramp_return_1',
		(ramp_lane_x1, RAMP_TURN_Y0_MM - 5.0),
		(RAMP_RETURN_END_X_MM, RAMP_RETURN_END_Y_MM),
		WALL_T_MM,
	)

	# ---- Dragon body + Lock lane (task 6, AD-6): off-centre (left of
	# PLAYFIELD_W_MM / 2 = 257.2 -- decisions-rejected.md:14,
	# machine-behaviour.md:9: the RIGHT flipper takes it straight, the LEFT
	# flipper backhands it), the Lock lane between its legs admitting a
	# precise shot, a body face a slightly-off shot strikes instead (FR-29).
	# bd_lock is authored at the Mouth pose above the body, aimed DOWN-TABLE
	# toward the flippers -- AD-6: "the Lock's pose IS the Mouth". ----
	lock_lane_x0 = DRAGON_CENTER_X_MM - LOCK_LANE_CLEAR_MM / 2
	lock_lane_x1 = DRAGON_CENTER_X_MM + LOCK_LANE_CLEAR_MM / 2
	dragon_leg_l_x0, dragon_leg_l_x1 = lock_lane_x0 - DRAGON_LEG_L_W_MM, lock_lane_x0
	dragon_leg_r_x0, dragon_leg_r_x1 = lock_lane_x1, lock_lane_x1 + DRAGON_LEG_R_W_MM
	# Rework iteration 2 (DW-119-class fix): each leg's own north face used to
	# be dead flat, stranding a ball at y = 633.5 (measured evidence). Sloped
	# AWAY from the Lock lane -- outward, toward the open field beside each
	# leg -- rather than toward it: the Lock lane is LOCK_LANE_CLEAR_MM
	# (40 mm) wide, only marginally over the 26.99 mm ball, so a slide funnel
	# aimed INTO that opening risks a new corner trap at the lane's own mouth
	# where the sloped face would meet it; outward is the side with real open
	# space on every one of this file's own authored figures.
	# Story 2.1c: the LEFT leg's own slope is reversed, x0 -> x1. It used to
	# push a resting ball OUTWARD (west), into what was then open field. With
	# the Left Loop lane widened to LOOP_LANE_CLEAR_MM = 66, col_loop_l's own
	# east face now sits 12 mm west of this leg, and a ball pushed that way
	# wedges between the two -- measured, parked at (91.50, 614.72) for the
	# whole budget, and it took six of test/shot-routing.test.ts's own cases
	# down with it. Pushed toward the Lock lane instead, it drops into that
	# lane's own 40 mm opening and carries on.
	#
	# Story 2.1d (task 8, DW-121-class swallow fix): DRAGON_LEG_Y1_MM itself
	# is UNMOVED (620.0, as 2.1b originally authored it) -- the swallow fix
	# instead re-sites the three slot zones DOWN into the corridor these
	# legs already bound (see the constants block's own [REWORK] note above
	# DRAGON_LEG_Y1_MM: extending the legs' own height instead reopened an
	# unrelated switch-max-speed regression against the DRAGON bank, at
	# every height tried across the required range). Both legs' own north
	# caps stay exactly where 2.1b drew them, each terminated by a rubber
	# post below (task 9) at their own unmoved free end.
	add_box_wall_sloped('col_dragon_leg_l', dragon_leg_l_x0, dragon_leg_l_x1, DRAGON_LEG_Y0_MM, DRAGON_LEG_Y1_MM, 'dragon', DRAGON_LEG_CAP_DROP_MM, 'x1')
	add_box_wall_sloped('col_dragon_leg_r', dragon_leg_r_x0, dragon_leg_r_x1, DRAGON_LEG_Y0_MM, DRAGON_LEG_Y1_MM, 'dragon', DRAGON_LEG_CAP_DROP_MM, 'x1')

	# Story 2.1d rework iteration 2 (code review 2026-09-03, HIGH): the
	# corridor's own north seal -- see the constants block's [REWORK] note
	# above DRAGON_LEG_CAP_DROP_MM for why col_dragon_leg_l's own bevel
	# cannot be reversed to close this gap directly (it would re-open the
	# col_loop_l wedge Story 2.1c's own bevel reversal exists to prevent,
	# a Block If), and why extending DRAGON_LEG_Y1_MM cannot either (the
	# DRAGON-bank contact-response regression, above). This is a genuinely
	# SEPARATE body instead: sealed at LOCK_CEILING_Y0_MM, at or below the
	# left leg's own true (non-bounding-box) recession point, spanning
	# LOCK_CEILING_X_OVERLAP_MM past each leg's own lane-facing face so its
	# flat SOUTH face -- the one a ball descending from open field above
	# the corridor actually contacts -- overlaps solid leg material on
	# both sides rather than meeting a knife-edge seam at exactly x =
	# lock_lane_x0/x1. Sloped on its own NORTH face for the same DW-119
	# reason every other flat-topped body in this file is (a ball landing
	# on TOP of the ceiling from further-open field above would otherwise
	# freeze against it exactly as the legs' own unsloped caps once did) --
	# its SOUTH face needs no such treatment: gravity's dominant -y
	# component pulls a ball resting against a wall's SOUTH-facing side
	# AWAY from that wall (the wall blocks further -y travel, propelling
	# the ball back the way it came), the opposite of the north-face
	# freeze case. `surface='dragon'` (guide-class, same as the legs) --
	# its own free ends are accounted for in the termination gate below
	# (task 9/13's own accounting), never assumed safe by omission.
	# col_lock_ceiling: a RIDGE (5-point, see this rework's own [REWORK]
	# note beside LOCK_CEILING_X_OVERLAP_E_MM for the three rounds that
	# led here) -- flat base sealing the corridor, two vertical risers
	# (DW-119-safe regardless of height: a vertical edge's own outward
	# normal has no y-component, so gravity's y-component can never press
	# a resting ball into it with zero tangential force), a shallow ridge
	# peaking at the centre (an unstable equilibrium, never a stable
	# valley -- col_loop_top's own proven shape, RIDGE_DROP_MM).
	lock_ceiling_x0 = lock_lane_x0 - LOCK_CEILING_X_OVERLAP_W_MM
	lock_ceiling_x1 = lock_lane_x1 + LOCK_CEILING_X_OVERLAP_E_MM
	# col_lock_ceiling_west_fill: plugs the gap col_dragon_leg_l's own
	# recession leaves west of the corridor. A parallelogram: its own
	# south edge is col_dragon_leg_l's own diagonal cap, ((lock_lane_x0,
	# DRAGON_LEG_L_INNER_SOLID_TOP_MM), (dragon_leg_l_x0, DRAGON_LEG_Y1_MM)),
	# offset down by LOCK_FILL_WEST_MARGIN_MM the WHOLE 60 mm run -- by
	# construction the SAME two-point line the leg's own cap is, merely
	# shifted, so it can never fall short of that leg's own true boundary
	# anywhere along its run (round 3 [of the ORIGINAL six rounds]'s own
	# defect: a 64 mm run here came out shallower, 17.35 deg against the
	# leg's own proven 18.43). Its own north edge is the identical line,
	# offset a further LOCK_FILL_THICKNESS_MM -- itself never flat (same
	# 18.43 deg slope as the south edge), and low-point-toward-the-corridor
	# by construction, so a ball resting on it slides toward col_lock_
	# ceiling and the lane, not toward col_loop_l (2.1c's own Block If,
	# undisturbed: this body never touches col_dragon_leg_l's own bevel
	# direction, only sits beside it).
	fill_east_x = lock_lane_x0
	fill_east_y = DRAGON_LEG_L_INNER_SOLID_TOP_MM - LOCK_FILL_WEST_MARGIN_MM
	fill_west_x = dragon_leg_l_x0
	fill_west_y = DRAGON_LEG_Y1_MM - LOCK_FILL_WEST_MARGIN_MM
	fill_north_east_y = fill_east_y + LOCK_FILL_THICKNESS_MM
	fill_north_west_y = fill_west_y + LOCK_FILL_THICKNESS_MM
	col_lock_ceiling_west_fill = new_prism_mesh(
		'col_lock_ceiling_west_fill',
		[
			(fill_east_x, fill_east_y),
			(fill_west_x, fill_west_y),
			(fill_west_x, fill_north_west_y),
			(fill_east_x, fill_north_east_y),
		],
		0.0, WALL_H_MM, parent=playfield_root,
	)
	set_props(col_lock_ceiling_west_fill, col_shape='wall', surface='dragon', phys_material='default')
	# col_lock_ceiling: a RIDGE (5-point, see this rework's own [REWORK]
	# note beside LOCK_CEILING_X_OVERLAP_E_MM for the three original rounds
	# that led here, and the constants block's own LOCK_CEILING_EAST_
	# SHOULDER_MM comment for the three FURTHER rounds rework iteration 3
	# needed) -- flat base sealing the corridor, two vertical risers
	# (DW-119-safe regardless of height: a vertical edge's own outward
	# normal has no y-component, so gravity's y-component can never press
	# a resting ball into it with zero tangential force), a shallow ridge
	# peaking off-centre (an unstable equilibrium, never a stable valley --
	# col_loop_top's own proven shape, RIDGE_DROP_MM).
	#
	# Rework iteration 3, round 7 (the shipped fix) -- see LOCK_CEILING_
	# RIDGE_MM's own comment (constants block, above) for the full seven-
	# round account. col_lock_ceiling stays FIVE points, the same shape
	# rework iteration 2 shipped -- only the peak's own HEIGHT moved (614 ->
	# 642 rise, LOCK_CEILING_RIDGE_MM); its own x position, and every other
	# vertex, are unchanged.
	lock_ceiling_west_shoulder_y = LOCK_CEILING_Y0_MM + LOCK_CEILING_SHOULDER_MM
	lock_ceiling_peak_x = lock_ceiling_x0 + (lock_ceiling_x1 - lock_ceiling_x0) * LOCK_CEILING_RIDGE_PEAK_FRACTION
	lock_ceiling_peak_y = lock_ceiling_west_shoulder_y + LOCK_CEILING_RIDGE_MM
	lock_ceiling_east_shoulder_y = LOCK_CEILING_Y0_MM + LOCK_CEILING_EAST_SHOULDER_MM
	col_lock_ceiling = new_prism_mesh(
		'col_lock_ceiling',
		[
			(lock_ceiling_x0, LOCK_CEILING_Y0_MM),
			(lock_ceiling_x1, LOCK_CEILING_Y0_MM),
			(lock_ceiling_x1, lock_ceiling_east_shoulder_y),
			(lock_ceiling_peak_x, lock_ceiling_peak_y),
			(lock_ceiling_x0, lock_ceiling_west_shoulder_y),
		],
		0.0, WALL_H_MM, parent=playfield_root,
	)
	set_props(col_lock_ceiling, col_shape='wall', surface='dragon', phys_material='default')

	bd_lock = new_empty('bd_lock', (DRAGON_CENTER_X_MM, DRAGON_MOUTH_Y_MM, BALL_MM / 2), parent=playfield_root)
	# local +Y (the eject-direction convention every bd_ empty in this file
	# shares) rotated 180 deg about Z lands on world -Y -- down-table, toward
	# the flippers (AD-6: "the Lock's pose IS the Mouth").
	bd_lock.rotation_euler = (0.0, 0.0, math.pi)

	# ---- DRAGON bank (task 7): six standup target faces spelling
	# D-R-A-G-O-N, left of the Ramp's own channel so neither crosses the
	# other. Drop/reset mechanics are Story 2.3's; these are ordinary
	# collidable bodies here. ----
	DRAGON_LETTERS = ('d', 'r', 'a', 'g', 'o', 'n')
	# Rework iteration 2 (DW-119-class fix) -- history, kept because the
	# dead end is informative: each target's own north face used to be dead
	# flat and stranded a ball at y = 721.5 (measured evidence). Bevelling
	# each target individually (as every OTHER flat-topped body this rework
	# fixed) does not work here, tried four ways and measured stuck at
	# essentially the same point every time regardless of direction or
	# steepness (outward-from-centre, reversed on col_dragon_n alone,
	# uniform toward smaller x, and a full-depth triangular bevel on every
	# target): each target is only 11 mm wide, UNDER the reference ball's
	# own radius (13.495 mm) let alone its diameter, so the ball's contact
	# footprint spans the whole face at once rather than resting on and
	# sliding along an extended incline the way it does on every other body
	# this rework fixed (60-355 mm wide, all comfortably bigger than the
	# ball) -- the same mechanism DW-119's own 165 mm-wide slope relies on,
	# scaled down past the point it still works. col_dragon_bank_backstop
	# (below) is the fix that held: ONE wide sloped wall spanning the WHOLE
	# bank, north of every target's own (plain, flat, reverted) face, so a
	# descending ball meets a genuinely extended incline before it can ever
	# reach a single target's own undersized one.
	for i, letter in enumerate(DRAGON_LETTERS):
		cx = DRAGON_BANK_X0_MM + i * DRAGON_BANK_PITCH_MM + DRAGON_BANK_TARGET_W_MM / 2
		add_box_wall(
			f'col_dragon_{letter}',
			cx - DRAGON_BANK_TARGET_W_MM / 2, cx + DRAGON_BANK_TARGET_W_MM / 2,
			DRAGON_BANK_Y0_MM, DRAGON_BANK_Y1_MM,
			'target',
		)

	# The backstop itself: flush against the bank's own north edge
	# (DRAGON_BANK_Y1_MM) so a descending ball reaches it before it could
	# ever settle on a single target's own north face, spanning well past
	# both ends of the six-target row (col_dragon_d's own west edge to
	# col_dragon_n's own east edge) for a genuinely wide incline -- DW-119's
	# own shallow-long-wall shape, this time actually wide enough to work.
	# Slopes toward smaller x: away from the Ramp (col_ramp_wall_l's own
	# west face sits only 343 - 336 = 7 mm clear of col_dragon_n's own east
	# edge, well under the ball's radius, so sloping toward the Ramp is not
	# an option here either) and clear of col_dragon_leg_r (whose own east
	# edge, x = 250, sits outside this backstop's y 708-723 span entirely --
	# the legs only reach y = 620).
	DRAGON_BACKSTOP_X0_MM = DRAGON_BANK_X0_MM - 15.0
	DRAGON_BACKSTOP_X1_MM = DRAGON_BANK_X0_MM + (len(DRAGON_LETTERS) - 1) * DRAGON_BANK_PITCH_MM + DRAGON_BANK_TARGET_W_MM + 5.0
	add_box_wall_sloped(
		'col_dragon_bank_backstop',
		DRAGON_BACKSTOP_X0_MM, DRAGON_BACKSTOP_X1_MM,
		DRAGON_BANK_Y1_MM, DRAGON_BANK_Y1_MM + 15.0,
		'target',
		15.0, 'x0',
	)

	# ---- Top lanes (task 7): three, in the upper field on the launched
	# ball's own path (above the Ramp and the pop nest, below the loop's own
	# top connector). ----
	for i, x_centre in enumerate(TOP_LANE_DIVIDER_XS_MM):
		add_box_wall(
			f'col_top_divider_{i + 1}',
			x_centre - TOP_LANE_DIVIDER_T_MM / 2, x_centre + TOP_LANE_DIVIDER_T_MM / 2,
			TOP_LANE_Y0_MM, TOP_LANE_Y1_MM,
			'plastic',
		)

	# ---- Slingshots (task 8): above the inlanes -- verified against
	# test/flipper-sweep-clearance.test.ts that neither enters the bat's
	# swept envelope nor narrows the 0.137 mm drain-end throat (both sit well
	# above GUIDE_Y_TOP_MM's own pocket geometry).
	# Rework iteration 2 (DW-119-class fix): each sling's own north face used
	# to be dead flat, stranding a ball that rolled up against it (parked at
	# y = 468.5, this rework's own measured evidence). Sloped toward the
	# TABLE CENTRE -- away from the perimeter wall each sling sits beside --
	# so a resting ball is pushed back into the open field rather than
	# wedged against col_wall_left/_lane. ----
	add_box_wall_sloped('col_sling_l', SLING_L_X0_MM, SLING_L_X1_MM, SLING_Y0_MM, SLING_Y1_MM, 'rubber_band', 20.0, 'x1')
	add_box_wall_sloped('col_sling_r', SLING_R_X0_MM, SLING_R_X1_MM, SLING_Y0_MM, SLING_Y1_MM, 'rubber_band', 20.0, 'x0')

	# ---- Pop bumpers (task 8): a nest of exactly three (author-decided
	# 2026-08-31 -- TABLE.authoredCounts.popBumpers records the count and its
	# provenance). Octagon posts, the same shape add_rubber_post() uses,
	# scaled to a pop-bumper-sized radius. ----
	POP_POSITIONS_MM = ((130.0, 800.0), (230.0, 800.0), (180.0, 870.0))
	for i, center in enumerate(POP_POSITIONS_MM):
		post = new_prism_mesh(f'col_pop_{i + 1}', octagon_points_mm(center, POP_BUMPER_RADIUS_MM), 0.0, WALL_H_MM, parent=playfield_root)
		set_props(post, col_shape='wall', surface='bumper', phys_material='default')

	# ---- Story 2.1d (task 9, AC 3, FR-31/AD-11): guide free-end
	# terminations. Story 2.1b drew its whole shot map under surfaces other
	# than 'rubber_post' at every free end (this story's own Code Map,
	# "The measured bare free ends" -- verified against the committed
	# document, not by inspection), so the pre-widening name-prefix gate
	# (col_guide_*) never saw one of them. Each post below closes exactly
	# one measured bare end from that table -- a NEW post at (or immediately
	# beside) the exact free-end coordinate the planning pass measured,
	# never a move of the guide body itself (the Block If: moving
	# col_sling_l/_r, col_ramp_wall_l/_r or the DRAGON bank is 2.1f's or out
	# of scope entirely -- adding the terminating post is the one change
	# permitted here). The col_top_divider_* UPPER tips and col_spinner_l's
	# own free end are NOT here: the former is closed by extending
	# TOP_LANE_Y1_MM to meet col_loop_top exactly (a genuine join, above);
	# the latter leaves the collision document entirely under task 10's
	# rename to vis_spinner_l. ----
	add_rubber_post('col_post_loop_l_funnel', (92.00, 438.00))  # col_loop_l_funnel's own mouth -- 2.1b; the nearest EXISTING post sat 6.00 mm away against a 4.5 mm budget
	add_rubber_post('col_post_loop_r_funnel', (376.40, 438.00))  # col_loop_r_funnel's own mouth -- 2.1b, the mirrored case
	add_rubber_post('col_post_ramp_wall_l_entrance', (332.00, 485.00))  # col_ramp_wall_l's own entrance lip -- 2.1b
	add_rubber_post('col_post_ramp_wall_r_entrance', (378.00, 485.00))  # col_ramp_wall_r's own entrance lip -- 2.1b
	add_rubber_post('col_post_ramp_wall_r_crossing', (378.00, 740.00))  # col_ramp_wall_r's own crossing lip -- 2.1b
	add_rubber_post('col_post_loop_r_lower', (396.40, 747.00))  # col_loop_r_lower's own north lip, the crossing gap -- 2.1c
	add_rubber_post('col_post_loop_r_south', (396.40, 832.00))  # col_loop_r's own south lip, the crossing gap -- 2.1b
	# col_top_divider_1..4's own LOWER tips (TOP_LANE_Y0_MM) -- 2.1b. Reuses
	# the same XS this story's own top-lane loop above draws the dividers
	# from, rather than a second set of bare coordinates.
	for x_centre in TOP_LANE_DIVIDER_XS_MM:
		add_rubber_post(f'col_post_top_divider_{x_centre:.0f}_lo', (x_centre, TOP_LANE_Y0_MM))
	# col_dragon_leg_l/_r's own NORTH caps -- 2.1b, UNMOVED by task 8 (see
	# that task's own note beside the leg-drawing calls: re-siting the slot
	# zones, not the legs, closes the swallow). Each sloped cap's own
	# free-end midpoint sits at (x-centre, DRAGON_LEG_Y1_MM - 10.0) -- the
	# midpoint of the edge from (x1, y1 - 20) to (x0, y1), 10 mm below the
	# high corner and 10 mm above the low one.
	#
	# Measured this pass (this story's own throwaway harness): a post
	# CENTRED exactly on that midpoint sits astride the sloped face's own
	# diagonal (roughly half embedded in the leg's own solid body, half in
	# open field, unlike a post on a FLAT cap where the same centring is
	# symmetric and already proven safe elsewhere in this file) and strands
	# a ball descending directly onto the LEFT leg (test/shot-routing.
	# test.ts's own case, final position (120.0, 627.5), net progress
	# 0.01 mm over the trailing 500-tick window) -- and the SAME defect the
	# Top-lane-3 case exposes independently (final position (114.1, 626.2)),
	# both bouncing into the identical pocket. A WEST offset of 4.0 mm
	# resolves both, within the gate's own postRadius + 0.5 mm budget of the
	# UNMOVED free-end coordinate (task 13); east and north were tried and
	# rejected, south (into the solid body) also happens to clear but west
	# is the more principled choice (further from the Lock lane, matching
	# the RIGHT leg's own already-clear placement below).
	DRAGON_LEG_CAP_MIDPOINT_DROP_MM = 10.0  # authored -- half of add_box_wall_sloped's own 20.0 mm drop, above
	DRAGON_LEG_L_POST_OFFSET_MM = 4.0

	def leg_north_cap_mid_mm(leg_x0, leg_x1):
		return ((leg_x0 + leg_x1) / 2, DRAGON_LEG_Y1_MM - DRAGON_LEG_CAP_MIDPOINT_DROP_MM)

	dragon_leg_l_cap_mid = leg_north_cap_mid_mm(dragon_leg_l_x0, dragon_leg_l_x1)
	dragon_leg_l_post_mm = (dragon_leg_l_cap_mid[0] - DRAGON_LEG_L_POST_OFFSET_MM, dragon_leg_l_cap_mid[1])
	dragon_leg_r_post_mm = leg_north_cap_mid_mm(dragon_leg_r_x0, dragon_leg_r_x1)
	add_rubber_post('col_post_dragon_leg_l', dragon_leg_l_post_mm)
	add_rubber_post('col_post_dragon_leg_r', dragon_leg_r_post_mm)
	# col_ramp_return_1's own HIGH (downstream, inlane-facing) end -- 2.1c.
	# Measured this pass, the same technique as the low end below: a post
	# centred exactly on the free-end midpoint (402.00, 764.00) sits in the
	# Left Loop orbit's own return path (entry offset 34 mm) -- s_inlane_r
	# lost, the ball draining down the right OUTLANE instead. Offset EAST
	# (toward the rail's own downstream/exit direction) by 4.0 mm restores
	# it, and the Ramp-return-geometry case (which approaches this SAME
	# rail from a different direction) stays green at every offset tried.
	add_rubber_post('col_post_ramp_return_1_a', (406.00, 764.00))
	# col_ramp_return_1's own LOW (upstream, ramp-crossing-facing) end -- 2.1c.
	# Measured this pass: a post centred exactly on the free-end midpoint
	# (372.00, 789.00) sits directly in the ball's own entry path onto this
	# rail -- test/shot-routing.test.ts's Ramp-return-geometry case and the
	# Left Loop's own 34 mm entry offset (whose orbit return crosses the
	# SAME rail) both lost s_inlane_r with the post there, the ball missing
	# the rail's guiding face entirely and draining instead. Offset SOUTH
	# (toward the rail's own downstream/exit direction, off the entry line)
	# by 4.0 mm, within the gate's own postRadius + 0.5 mm budget --
	# verified against the real physics pipeline (six candidate offsets,
	# this story's own throwaway harness): south and a smaller east offset
	# both restore s_inlane_r; west, north and a north-west diagonal do not.
	add_rubber_post('col_post_ramp_return_1_b', (372.00, 785.00))
	# col_loop_l_return / col_loop_r_return's own inboard ends are NOT posted:
	# add_loop_return_rail() deliberately TAPERS that end to a single point
	# rather than closing it with a perpendicular cap face (this file's own
	# comment on that helper: "A tapered end presents only the rail's own
	# north face to that ball, which it grazes and rides"). FR-31's own
	# hazard is a ball catching an exposed FLAT bare-metal end cap; a
	# zero-width taper presents no such face, so this is a genuine
	# structural exemption (task 13's allowlist entry), not an oversight.
	# Measured this pass: a rubber post centred at either rail's own
	# nearest-edge midpoint sits astride the rail's own diagonal face and
	# strands a ball descending the right inlane feed (test/shot-
	# routing.test.ts's 'Left Loop, entry offset 34 mm' and the Ramp-return-
	# geometry case both lost s_inlane_r with the post present); removing it
	# restores both.
	# col_sling_l/_r's own upper ends -- 2.1b. The Block If protects the
	# sling bodies THEMSELVES (2.1f territory); adding the terminating post
	# here moves nothing about either sling.
	add_rubber_post('col_post_sling_l', (114.00, 420.00))
	add_rubber_post('col_post_sling_r', (370.40, 437.50))

	# Story 2.1d task 13 (structural gate) -- measured this pass, running the
	# hardened, structural free-end derivation (task 12) over every
	# guide-class col_ wall body rather than trusting the pre-existing,
	# name-scoped bare-end table: nine further bare ends the table's own
	# (pre-hardening) derivation missed, plus one real DW-128 case in a
	# COMMITTED body (col_sling_l, below).
	#
	# col_channel_l_1/_2, col_channel_r_1/_2 (2.1a, DW-119's below-deck
	# outlane return rail): the OUTER tip of each bent rail's own two
	# segments (the shared "knee" between segment 1 and 2 is already
	# joined). Below-deck, but a flat-capped quad like any other guide, not
	# a tapered rail -- terminated rather than assumed safe.
	add_rubber_post('col_post_channel_l_1', (0.00, -18.00))
	add_rubber_post('col_post_channel_l_2', (205.00, -81.00))
	add_rubber_post('col_post_channel_r_1', (468.40, -18.00))
	add_rubber_post('col_post_channel_r_2', (304.90, -81.00))
	# col_dragon_leg_l/_r's own SOUTH caps (DRAGON_LEG_Y0_MM, 480) -- 2.1b.
	# The pre-hardening bare-end table covered only the NORTH cap of each
	# leg; the flat south cap sits in the open, flipper-adjacent field and
	# is exactly as reachable.
	add_rubber_post('col_post_dragon_leg_l_south', (120.00, 480.00))
	add_rubber_post('col_post_dragon_leg_r_south', (212.50, 480.00))
	# col_ramp_wall_l's own SECOND free end (the crossing lip, mirroring
	# col_ramp_wall_r's own col_post_ramp_wall_r_crossing) -- 2.1b/2.1c.
	add_rubber_post('col_post_ramp_wall_l_crossing', (332.00, 822.50))
	# col_sling_r's own SECOND free end (the west/short side, distinct from
	# the already-terminated east side above) -- 2.1b. Measured this pass: a
	# post centred exactly on the free-end midpoint sits in the path of
	# test/util/shot-cases.ts's 'dragon-bank-right-column-300' (a shot from
	# (300, 400) straight up-table, only ~14 mm west of the true midpoint),
	# deflecting the ball before it ever reaches the DRAGON bank. Offset
	# EAST by 3.5 mm, within the gate's own postRadius + 0.5 mm budget,
	# resolves it; west offsets clear the shot but strike col_sling_r's own
	# face instead of clearing it, changing which case the shot exercises.
	add_rubber_post('col_post_sling_r_west', (317.50, 427.50))
	# col_sling_l (DW-128, a REAL committed case): its own footprint is a
	# genuine wedge -- the south cap (32 mm) and the east side (15 mm,
	# shortened by the SAME 20 mm anti-stranding drop every sloped cap in
	# this file uses) are its two globally shortest edges, and they are
	# ADJACENT (share the corner at (130, 420)), which is exactly task 12's
	# own hardened check's rejection condition: the OLD, unhardened
	# derivation returned two midpoints near that SAME corner
	# ((114, 420), already terminated above, and (130, 427.5), which the
	# join-detection in test/asset-contract.test.ts correctly reads as
	# joined to nothing new) and never tested the TRUE far end -- the sloped
	# north cap's own midpoint, (114, 445). The Block If protects col_sling_l
	# itself (2.1f territory: re-authoring the slope so its shortest edges
	# become the correct opposite pair is a body change beyond "adding the
	# terminating post"), so this story does not re-shape it -- it is
	# NAMED, not fixed, in the gate's own exemption allowlist (task 13), and
	# a second post is added here at the true far end as a safety measure a
	# ball can actually reach.
	add_rubber_post('col_post_sling_l_north', (114.00, 445.00))
	# Story 2.1d rework iteration 2 (code review 2026-09-03, five geometry
	# rounds -- see this rework's own [REWORK] notes in the constants
	# block, beside LOCK_CEILING_X_OVERLAP_E_MM and LOCK_FILL_THICKNESS_MM,
	# for the full account). Final shape: col_lock_ceiling is a 5-point
	# RIDGE (its own two vertical risers are the only genuinely bare ends
	# a non-quad shape like this has -- freeEndsMm() cannot derive them at
	# all, point count != 4, so it is a named exemption below);
	# col_lock_ceiling_west_fill is a 4-point parallelogram whose own EAST
	# riser ends up buried inside col_lock_ceiling's own solid material
	# (round 5's own generous thickness) rather than genuinely joined to
	# any of its edges. All four risers across both bodies are posted:
	#  - col_lock_ceiling's own EAST riser (194.00, 606.00), 4 mm short of
	#    col_dragon_leg_r's own vertical face.
	#  - col_lock_ceiling's own WEST riser (146.00, 606.00), buried inside
	#    col_lock_ceiling_west_fill's own material without touching an edge.
	#  - col_lock_ceiling_west_fill's own EAST riser -- unlike the other
	#    three, this end IS genuinely bare, not buried: rework iteration 3's
	#    own round 7 raised col_lock_ceiling's own peak (624 -> 642) without
	#    also raising its WEST flank's own reach far enough at x = 150 to
	#    keep containing this riser's own (now taller, LOCK_FILL_THICKNESS_
	#    MM-linked) own midpoint -- see the add_rubber_post() call below for
	#    its own current coordinate, DERIVED from the live geometry rather
	#    than hand-measured, since a hand-measured coordinate is exactly
	#    what went stale here once already.
	#  - col_lock_ceiling_west_fill's own WEST riser, above col_dragon_
	#    leg_l's own true top (DRAGON_LEG_Y1_MM, 620).
	add_rubber_post('col_post_lock_ceiling_e', (194.00, 606.00))
	add_rubber_post('col_post_lock_ceiling_w', (146.00, 606.00))
	# Rework iteration 3, round 7: col_lock_ceiling_west_fill's own two
	# vertical risers grew taller (LOCK_FILL_THICKNESS_MM 36 -> 54, tied
	# LIVE to col_lock_ceiling's own raised peak -- see that constant's own
	# comment), moving their own true midpoints -- east riser (150, 598) to
	# (150, 652), midpoint 625 (was 616); west riser (90, 618) to
	# (90, 672), midpoint 645 (was 633). Unlike col_lock_ceiling itself
	# (exempted on the gate's own allowlist, verify()'d against a fixed
	# coordinate), col_lock_ceiling_west_fill is NOT exempted -- its own
	# ends are derived for real by freeEndsMm() and checked against the
	# ACTUAL post position, so these two posts must track the true
	# midpoint or the gate's own post-distance assertion reddens.
	add_rubber_post('col_post_lock_ceiling_west_fill_e', (fill_east_x, (fill_east_y + fill_north_east_y) / 2.0))
	add_rubber_post('col_post_lock_ceiling_west_fill_w', (fill_west_x, (fill_west_y + fill_north_west_y) / 2.0))
	# The three false GUIDE_TERMINATION_EXEMPTIONS reasons a parallel code
	# review pass found (test/asset-contract.test.ts's own allowlist claimed
	# "joined on both sides" for three bodies with a genuinely bare, ball-
	# reachable end). Two closed here: col_loop_turn_r's own 12 mm cap
	# (a wedge-shaped turn piece, same DW-128 shape class as col_sling_l --
	# freeEndsMm() throws on it for the SAME adjacent-shortest-edges
	# reason, so it stays on the exemption list structurally, but its own
	# true bare end is now posted rather than merely asserted joined);
	# col_ramp_turn's own bare end, 8.99 mm from the nearest existing post
	# against a 4.50 mm budget -- also a wedge (same reasoning), closed the
	# same way. col_loop_top's own two 9.5 mm end caps are NOT closed here
	# -- see this rework's own [BLOCK IF] note at their exemption entry in
	# test/asset-contract.test.ts: a post at the measured free-end
	# coordinate, and at every position tried within the gate's own
	# postRadius + 0.5 budget, measurably breaks Story 2.1c's own
	# delivered orbit (the Loop 34 mm entry offset cases) -- this file's
	# OWN pre-existing RIDGE_DROP_MM comment (above) already documents
	# this exact area as swept and hand-tuned against that identical
	# regression. HALTed per the Block If rather than traded.
	add_rubber_post('col_post_loop_turn_r', (474.40, 1036.00))
	add_rubber_post('col_post_ramp_turn', (338.00, 829.20))

	# ---- Switch zones: box shape, paired with their TABLE switch ----
	sw_shooter_lane = new_box_mesh(
		'sw_shooter_lane', (LANE_X0_MM + WALL_T_MM + 4, 10, 0), (PLAYFIELD_W_MM - 4, 60, 30),
		parent=playfield_root,
	)
	set_props(sw_shooter_lane, col_shape='box', switch='s_shooter_lane', surface='metal', phys_material='default')

	# Story 1.5 (DW-58): retiled as four CONTIGUOUS boxes spanning the full
	# drain aperture (DRAIN_X0_MM..DRAIN_X1_MM), rather than four narrower
	# islands with gaps between them -- the original tiling covered only 64 mm
	# of the 114.4 mm aperture in four disconnected 16 mm-wide islands, and a
	# measured sweep of drain crossings missed three of five. The y extent
	# also widened, from -80..-40 to -80..0 (review finding 2026-08-28 asked
	# for this to be explained here, not only in the spec's own planning
	# notes): the upper bound now sits exactly at y = 0, the drain wall's own
	# inner face (col_wall_bottom_l/_r span y in [-12, 0]), so a ball crossing
	# the aperture at y = 0 is caught immediately rather than only after
	# falling a further 40 mm past the wall -- this is the same "zero misses
	# across a 0.5 mm sweep" figure the x-retiling above was measured against.
	# Provisional placeholder geometry, not derived from any acceptance
	# criterion.
	trough_switch_names = ['s_trough_1', 's_trough_2', 's_trough_3', 's_trough_4']
	trough_slot_w_mm = (DRAIN_X1_MM - DRAIN_X0_MM) / len(trough_switch_names)  # 28.6 mm
	for i, switch_name in enumerate(trough_switch_names):
		slot_x0 = DRAIN_X0_MM + i * trough_slot_w_mm
		slot_x1 = DRAIN_X0_MM + (i + 1) * trough_slot_w_mm
		sw = new_box_mesh(
			f'sw_trough_{i + 1}', (slot_x0, -80, 0), (slot_x1, 0, 20),
			parent=playfield_root,
		)
		set_props(sw, col_shape='box', switch=switch_name, surface='metal', phys_material='default')

	# ---- Story 2.1b: the shot-map switch zones, one per zone-requiring
	# switch (Design Notes, "Which switches require a zone" -- everything
	# except button, cabinet-mechanism and parking-device-slot switches --
	# AD-2's own three-source partition). Sized generously so a
	# maximum-speed ball's per-tick swept segment can never straddle a zone
	# (AC 2, AC 5) -- verified by test/switch-max-speed.test.ts. sw_ zones
	# cannot be rotated (export.py:252-256), so every one below is an
	# axis-aligned box. ----
	def add_switch_zone(name, switch_name, min_mm, max_mm):
		sw = new_box_mesh(name, min_mm, max_mm, parent=playfield_root)
		set_props(sw, col_shape='box', switch=switch_name, surface='metal', phys_material='default')
		return sw

	# Loops
	# Story 2.1c: both Loops' own _in zones move from over the OUTLANE to over
	# the lane's own new mouth -- which, since the funnel now bends the inner
	# rail outboard, sits between the divider guide and the slingshot. Both a
	# ball shot INTO the lane and a ball the orbit returns OUT of it pass
	# through this same mouth, which is what makes the DW-123 single-ball
	# orbit case (one ball closing all four Loop switches) observable at all.
	add_switch_zone('sw_loop_l_in', 's_loop_l_in', (2, 425, 0), (loop_l_x0 - 10, 475, 30))
	add_switch_zone('sw_loop_l_out', 's_loop_l_out', (5, 820, 0), (loop_l_x0 - 5, 880, 30))
	add_switch_zone('sw_loop_r_in', 's_loop_r_in', (loop_r_x1 + 10, 425, 0), (LANE_X0_MM - 2, 475, 30))
	add_switch_zone('sw_loop_r_out', 's_loop_r_out', (loop_r_x1 + 5, 820, 0), (LANE_X0_MM - 5, 880, 30))
	add_switch_zone('sw_spinner', 's_spinner', (5, 635, 0), (45, 662, 30))

	# Ramp
	add_switch_zone('sw_ramp_enter', 's_ramp_enter', (ramp_lane_x0 + 2, RAMP_ENTER_Y_MM + 5, 0), (ramp_lane_x1 - 2, RAMP_ENTER_Y_MM + 40, 30))
	add_switch_zone('sw_ramp_made', 's_ramp_made', (ramp_lane_x0 + 2, RAMP_TOP_Y_MM - 35, 0), (ramp_lane_x1 - 2, RAMP_TOP_Y_MM - 3, 30))

	# Dragon body + Lock lane. The legs are REAL solid col_ bodies (a
	# standup-class switch backed by a wall the ball actually rams into, not
	# an open lane it passes through) -- a ball's own CENTRE can never
	# approach closer than one ball radius (BALL_MM / 2 = 13.495 mm) to the
	# leg's front face (DRAGON_LEG_Y0_MM = 480) before its surface contacts
	# the solid geometry and the collision response turns it back. A zone
	# placed AT or BEHIND that face (as an earlier pass of this script did)
	# is therefore physically unreachable and can never register at any
	# speed -- found and verified this story's own planning pass, driving a
	# ball at the measured maximum speed through createMachine() and
	# observing zero switch events despite the ball visibly approaching the
	# target (test/switch-max-speed.test.ts's own end-to-end case). Both
	# zones below sit entirely BEFORE the face, with a safety margin under
	# the ball-radius reach limit.
	BALL_RADIUS_MM = BALL_MM / 2
	dragon_body_zone_y1 = DRAGON_LEG_Y0_MM - BALL_RADIUS_MM - 1.5
	dragon_body_zone_y0 = dragon_body_zone_y1 - 35.0
	add_switch_zone('sw_dragon_body_l', 's_dragon_body', (dragon_leg_l_x0 + 4, dragon_body_zone_y0, 0), (dragon_leg_l_x1 - 4, dragon_body_zone_y1, 50))
	add_switch_zone('sw_dragon_body_r', 's_dragon_body', (dragon_leg_r_x0 + 4, dragon_body_zone_y0, 0), (dragon_leg_r_x1 - 4, dragon_body_zone_y1, 50))
	# Story 2.1d rework iteration 2: SW_LOCK_LANE_Y0/Y1_MM re-based to sit
	# flush with the corridor's own bottom (see the constants block's own
	# [REWORK] note); the +2/-2 mm x inset is unmoved 2.1b geometry.
	add_switch_zone('sw_lock_lane', 's_lock_lane', (lock_lane_x0 + 2, SW_LOCK_LANE_Y0_MM, 0), (lock_lane_x1 - 2, SW_LOCK_LANE_Y1_MM, 30))
	# Story 2.1d (task 8), rework iteration 2: the three slot zones, sited
	# into the corridor the legs and col_lock_ceiling now TRULY bound (see
	# the constants block's own [REWORK] notes above DRAGON_LEG_Y1_MM and
	# DRAGON_LEG_CAP_DROP_MM for the two things that went wrong first:
	# extending the legs' own height re-opened a DRAGON-bank contact-
	# response regression, and the first re-siting measured the corridor's
	# own top against the legs' BOUNDING BOX rather than col_dragon_leg_l's
	# own true, receded solid face). The Mouth's own eject pose
	# (DRAGON_MOUTH_Y_MM, 460.0) now sits SOUTH of the whole slot band and
	# of sw_lock_lane both -- see DRAGON_MOUTH_Y_MM's own [REWORK] note for
	# why the ejected ball no longer needs to cross the slot band at all,
	# and is covered by devices.ts's own "one ball per pulse" exemption
	# (task 5) from the spawn tick regardless.
	LOCK_SLOT_NAMES = ('s_lock_1', 's_lock_2', 's_lock_3')
	assert len(LOCK_SLOT_NAMES) == LOCK_SLOT_COUNT, 'LOCK_SLOT_NAMES and LOCK_SLOT_COUNT (the constants block above) must agree'
	for i, switch_name in enumerate(LOCK_SLOT_NAMES):
		slot_y0 = LOCK_SLOT_Y0_BASE_MM + i * LOCK_SLOT_PITCH_MM
		add_switch_zone(f'sw_lock_{i + 1}', switch_name, (lock_lane_x0, slot_y0, 0), (lock_lane_x1, slot_y0 + LOCK_SLOT_DEPTH_MM, 30))

	# DRAGON bank -- one zone per target, same x span as its col_ face. Same
	# reachability fix as sw_dragon_body_l/r above: each target is a REAL
	# solid drop_target-class body, so the zone sits entirely BEFORE
	# DRAGON_BANK_Y0_MM, clear of the one-ball-radius approach limit, rather
	# than overlapping the target's own (physically unreachable) footprint.
	dragon_bank_zone_y1 = DRAGON_BANK_Y0_MM - BALL_RADIUS_MM - 1.5
	dragon_bank_zone_y0 = dragon_bank_zone_y1 - 30.0
	for i, letter in enumerate(DRAGON_LETTERS):
		cx = DRAGON_BANK_X0_MM + i * DRAGON_BANK_PITCH_MM + DRAGON_BANK_TARGET_W_MM / 2
		add_switch_zone(
			f'sw_dragon_{letter}', f's_dragon_{letter}',
			(cx - DRAGON_BANK_TARGET_W_MM / 2 - 2, dragon_bank_zone_y0, 0),
			(cx + DRAGON_BANK_TARGET_W_MM / 2 + 2, dragon_bank_zone_y1, 30),
		)

	# Top lanes -- one zone per gap between consecutive dividers.
	TOP_LANE_NAMES = ('s_top_1', 's_top_2', 's_top_3')
	for i, switch_name in enumerate(TOP_LANE_NAMES):
		lane_x0 = TOP_LANE_DIVIDER_XS_MM[i] + TOP_LANE_DIVIDER_T_MM / 2
		lane_x1 = TOP_LANE_DIVIDER_XS_MM[i + 1] - TOP_LANE_DIVIDER_T_MM / 2
		add_switch_zone(f'sw_top_{i + 1}', switch_name, (lane_x0, TOP_LANE_Y0_MM + 5, 0), (lane_x1, TOP_LANE_Y1_MM - 5, 30))

	# Inlanes / outlanes -- 2.1a's own drain-triangle geometry, this story's
	# own switches (Epic 1 never named them; the geometry has always been
	# there since 2.1a).
	add_switch_zone('sw_inlane_l', 's_inlane_l', (left_divider_x1 + 2, 150, 0), (left_divider_x1 + 40, 200, 30))
	add_switch_zone('sw_inlane_r', 's_inlane_r', (right_divider_x0 - 40, 150, 0), (right_divider_x0 - 2, 200, 30))
	add_switch_zone('sw_outlane_l', 's_outlane_l', (2, 150, 0), (left_divider_x0 - 2, 200, 30))
	add_switch_zone('sw_outlane_r', 's_outlane_r', (right_divider_x1 + 2, 150, 0), (LANE_X0_MM - 2, 200, 30))

	# Slingshots and pop bumpers
	# Same reachability fix as sw_dragon_body_l/_r and the pop zones above:
	# both slingshots are REAL solid col_ bodies (standup class), so a zone
	# overlapping the body's own footprint (this zone's original span,
	# SLING_Y0_MM - 4 .. SLING_Y1_MM + 4) sits at or behind the one-ball-
	# radius approach limit and is physically unreachable from below. The
	# zone sits entirely BEFORE the sling's own front face instead.
	sling_zone_y1 = SLING_Y0_MM - BALL_RADIUS_MM - 1.5
	sling_zone_y0 = sling_zone_y1 - 25.0
	add_switch_zone('sw_sling_l', 's_sling_l', (SLING_L_X0_MM - 4, sling_zone_y0, 0), (SLING_L_X1_MM + 4, sling_zone_y1, 30))
	add_switch_zone('sw_sling_r', 's_sling_r', (SLING_R_X0_MM - 4, sling_zone_y0, 0), (SLING_R_X1_MM + 4, sling_zone_y1, 30))
	for i, center in enumerate(POP_POSITIONS_MM):
		add_switch_zone(
			f'sw_pop_{i + 1}', f's_pop_{i + 1}',
			(center[0] - POP_ZONE_HALF_MM, center[1] - POP_ZONE_HALF_MM, 0),
			(center[0] + POP_ZONE_HALF_MM, center[1] + POP_ZONE_HALF_MM, 30),
		)

	# Drain -- the "ball reached the aperture" edge, distinct from
	# sw_trough_1..4 (the PARKING device's own slot switches, excluded from
	# the generic tracker by AD-6).
	#
	# Rework iteration 3 (DW-121, author's answer B): widened from the
	# original (DRAIN_X0_MM, -5, 0)..(DRAIN_X1_MM, 15, 30) -- sized only for
	# the CENTRE drain's own near-vertical drop through the aperture -- to
	# span the WHOLE below-deck corridor, x in [0, PLAYFIELD_W_MM], y in
	# [-80, 15]. Measured evidence (this story's own rework pass): a ball
	# descending the RIGHT OUTLANE crosses y = 0 at x ~ 445-448 (inside the
	# outlane's own gap in col_wall_bottom_r, far outside the old zone's
	# x band) and, by the time add_outlane_return_channel()'s own diagonal
	# rail has carried its x back into [DRAIN_X0_MM, DRAIN_X1_MM], its y has
	# already fallen to roughly -67 to -75 -- well under the old zone's
	# y = -5 floor -- so it reached bd_trough with NO s_drain edge ever
	# emitted (an FR-11 class miss: a drain the drain switch never saw). The
	# left outlane's own return channel (build_channel_rail_points(0.0, ...))
	# has the same shape, mirrored, and would miss the same way.
	#
	# The widened zone is not merely generous, it is architecturally exact
	# for y < 0: that band is reachable ONLY by falling through one of this
	# file's own three deck gaps (the centre aperture and the two outlane
	# gaps in col_wall_bottom_l/_r) -- the playfield's own y range is
	# [0, PLAYFIELD_H_MM] (AD-10), so no on-deck path ever puts a ball at
	# y < 0 during ordinary play -- and it catches every drain path this
	# file draws -- the centre aperture (a near-vertical crossing right at
	# y = 0, the old zone's own case, still covered by the y <= 15 band
	# above) and both outlane return channels (whose own diagonal rails run
	# as low as CHANNEL_Y_END_MM = -75, comfortably inside the new -80
	# floor, at every x along their own run). z stays 0..30 -- this
	# collision model has no real Z-drop (col_playfield is a single plane,
	# DW-120's own Design Notes), so a below-deck ball rests at the same
	# ball-radius height as an on-deck one.
	#
	# The x range stops at LANE_X0_MM (468.4), NOT the full playfield width
	# -- found and fixed during this rework's own verification pass (a
	# false s_drain make surfaced at tick 581 of a bare trough-eject serve,
	# nowhere near any drain): the FIRST version of this fix spanned
	# x in [0, PLAYFIELD_W_MM], which reaches into the shooter lane itself
	# (x ~ 480.4..514.4, BD_TROUGH_EJECT_X_MM = 497.4) -- a freshly served
	# ball settles there at y ~ 13.5, inside the y <= 15 band above, so
	# EVERY ordinary trough eject spuriously closed s_drain. The shooter
	# lane is never part of any drain path (a ball there is freshly served
	# or waiting to be plunged, AD-6), so excluding x > LANE_X0_MM loses no
	# real drain coverage: both outlane channels stay at x <= LANE_X0_MM
	# their entire run (the right one starts exactly there and only
	# decreases), and the centre aperture sits at x in
	# [DRAIN_X0_MM, DRAIN_X1_MM], both comfortably inside the narrower band.
	add_switch_zone('sw_drain', 's_drain', (0.0, -80, 0), (LANE_X0_MM, 15, 30))

	# ---- Ball devices: empties at their authored eject pose ----
	# bd_trough -- Story 1.5 (DW-51, DW-58): relocated from the original
	# (255, -60, 10) -- squarely inside the drain gap, where the ejected ball
	# could never reach sw_shooter_lane at any speed (measured during
	# planning) -- to the shooter-lane foot, the same resting pose a served
	# ball settles at. Provisional placeholder geometry, not derived from any
	# acceptance criterion; expressed from the existing named constants.
	BD_TROUGH_EJECT_X_MM = LANE_X0_MM + WALL_T_MM + LANE_CLEAR_MM / 2  # 497.4
	BD_TROUGH_EJECT_Y_MM = 20.0
	BD_TROUGH_EJECT_Z_MM = BALL_MM / 2  # 13.495
	bd_trough = new_empty(
		'bd_trough', (BD_TROUGH_EJECT_X_MM, BD_TROUGH_EJECT_Y_MM, BD_TROUGH_EJECT_Z_MM), parent=playfield_root,
	)
	bd_trough.rotation_euler = (0.0, 0.0, 0.0)  # local +Y is the eject direction: (0, 1, 0)

	bd_shooter = new_empty('bd_shooter', (498.0, 35.0, 13.0), parent=playfield_root)
	bd_shooter.rotation_euler = (0.0, 0.0, 0.0)  # local +Y is the eject direction: (0, 1, 0)

	# ---- vis_playfield: the one `vis_` placeholder mesh (visible geometry) ----
	vis_playfield = new_box_mesh(
		'vis_playfield', (0, 0, -1.0), (PLAYFIELD_W_MM, PLAYFIELD_H_MM, 0.0),
		parent=playfield_root, material=mat_playfield, second_uv=True,
	)
	set_props(vis_playfield, lightgroup='lg_playfield')

	# ---- l_insert_left: ONE object, lens + cup geometry joined, ONE material
	# slot (AD-11: "one material each") ----
	lens_bm = _box_bmesh((249.0, 492.0, -1.0), (265.0, 508.0, 0.5))
	cup_bm = _box_bmesh((247.0, 490.0, -7.0), (267.0, 510.0, -1.0))
	# Merge cup_bm's geometry into lens_bm via an explicit vertex map -- BMesh
	# vertex `.index` is stale (0 for every fresh vert) until an explicit
	# `index_update()`, so mapping by BMVert object identity is the robust way
	# to carry cup_bm's faces over onto the new verts (measured: an
	# index-based join here raised "found the same (BMVert) used multiple
	# times", every new vert's stale index reading 0).
	vert_map = {v: lens_bm.verts.new(v.co) for v in cup_bm.verts}
	for f in cup_bm.faces:
		lens_bm.faces.new([vert_map[v] for v in f.verts])
	cup_bm.free()
	lens_bm.normal_update()
	insert_mesh = bpy.data.meshes.new('l_insert_left')
	lens_bm.to_mesh(insert_mesh)
	lens_bm.free()
	insert_mesh.uv_layers.new(name='uv_base')
	insert_mesh.uv_layers.new(name='uv_lightmap')
	insert_mesh.materials.append(mat_insert)
	l_insert_left = bpy.data.objects.new('l_insert_left', insert_mesh)
	l_insert_left.data.name = 'l_insert_left'
	bpy.context.scene.collection.objects.link(l_insert_left)
	l_insert_left.parent = playfield_root
	set_props(l_insert_left, lightgroup='lg_inserts')

	# ---- Presentation selection (Design Notes, "What goes into the glb"):
	# the three roots, vis_playfield, l_insert_left, bd_trough, bd_shooter,
	# bd_lock (Story 2.1b). col_/sw_ nodes are excluded -- collision
	# scaffolding, never rendered. ----
	for obj in bpy.data.objects:
		obj.select_set(False)
	presentation_objects = [
		playfield_root, cabinet_root, pivot_pitch,
		vis_playfield, vis_spinner_l, l_insert_left, bd_trough, bd_shooter, bd_lock,
	]
	for obj in presentation_objects:
		obj.select_set(True)
	bpy.context.view_layer.objects.active = playfield_root

	# Purge anything left over from Blender's own factory-startup scene (e.g.
	# an unused default material datablock orphaned by clear_scene(), which
	# only unlinks OBJECTS) so the committed file holds nothing but what this
	# script authored.
	bpy.ops.outliner.orphans_purge(do_recursive=True)

	# Resolved relative to THIS script's own repository, not Blender's default
	# startup cwd or `//` (which resolves relative to the .blend being saved --
	# meaningless on a from-scratch run where that file does not exist yet).
	out_path = os.path.join(REPO_ROOT, 'assets', 'src', 'dragonwar.blend')
	bpy.ops.wm.save_as_mainfile(filepath=out_path, compress=True)
	print(f'[make-placeholder-blend] wrote {out_path}')


if __name__ == '__main__':
	main()
