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
LOOP_LANE_CLEAR_MM = 50.0
# The loop's own outer arc, offset in from the perimeter wall's interior face
# by LOOP_LANE_CLEAR_MM at the top of the table -- the top connector's own
# lane-facing (south) face.
LOOP_TOP_INNER_Y_MM = PLAYFIELD_H_MM - LOOP_LANE_CLEAR_MM  # 1016.8
# Where each loop's lane widens from the OUTLANE-width funnel mouth (sharing
# the existing col_post_divider_*_hi post's own span, so no new post is
# needed at the bottom -- task 3: "from the two *_divider_*_hi posts") out to
# the full LOOP_LANE_CLEAR_MM run.
LOOP_FUNNEL_Y0_MM = GUIDE_Y_TOP_MM  # 420 -- starts exactly at the existing post
LOOP_FUNNEL_Y1_MM = 500.0  # authored -- a short, gentle widening run

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
RAMP_ENTER_X_MM = 372.0  # authored -- right of centre (> 257.2); pushed right of the DRAGON bank's own column (below) so neither shadows the other
RAMP_ENTER_Y_MM = 470.0
RAMP_TOP_Y_MM = 825.0
RAMP_HEIGHT_MM = 90.0  # authored -- the visual ramp's rise, unused by this collision model (see the note above); would be confirmed by a Reference-machine measurement once art replaces the placeholder (Story 5.x)
RAMP_GRADIENT = 0.20  # authored -- rise over run, unused by this collision model, same provenance note as RAMP_HEIGHT_MM

# Dragon (task 6): off-centre so a rejection deflects to a flipper
# (decisions-rejected.md:14, machine-behaviour.md:9) -- the RIGHT flipper
# takes it straight and the LEFT flipper backhands it, which places the body
# LEFT of PLAYFIELD_W_MM / 2 = 257.2 mm.
DRAGON_CENTER_X_MM = 170.0  # authored -- left of centre
LOCK_LANE_CLEAR_MM = 40.0  # authored -- "a narrow lane admitting a precise shot", narrower than every other lane this story draws
DRAGON_LEG_W_MM = 60.0  # authored -- each leg's own footprint width
DRAGON_LEG_Y0_MM = 480.0
DRAGON_LEG_Y1_MM = 620.0
DRAGON_MOUTH_Y_MM = 650.0  # bd_lock's own pose -- AD-6: "the Lock's pose IS the Mouth"

# DRAGON bank (task 7): six target faces spelling D-R-A-G-O-N, legible from
# the fixed camera, left of the Ramp's own channel so neither crosses the
# other.
DRAGON_BANK_Y0_MM = 700.0
DRAGON_BANK_Y1_MM = 708.0
# Story 2.1b planning-pass finding (verified empirically, not by inspection):
# the Dragon's own legs are REAL solid col_ bodies spanning the FULL
# interior height (z 0..WALL_H_MM) across x in [90, 150] (left) and
# [190, 250] (right), y in [480, 620] -- a bank starting at x = 90 (this
# constant's own original value) put four of its six targets directly
# behind that shadow, physically unreachable by any straight shot from
# below regardless of the bank's own y (driving a ball at the measured
# maximum speed through the real createMachine() pipeline showed it
# deflecting off a leg's top edge well short of the bank -- this file's own
# switch-zone placement note beside sw_dragon_body_l/r explains the
# one-ball-radius reachability limit the SAME mistake nearly repeated here).
# The bank's own x-span is therefore anchored clear of BOTH legs (> 250) and
# the Ramp is pushed right of it in turn (RAMP_ENTER_X_MM, above) so neither
# shadows the other.
DRAGON_BANK_X0_MM = 255.0
DRAGON_BANK_PITCH_MM = 14.0  # authored -- centre-to-centre spacing between the six targets, narrowed to fit clear of both legs and the Ramp
DRAGON_BANK_TARGET_W_MM = 11.0

# Top lanes (task 7): three, in the upper field on the launched ball's own
# path (above the Ramp and the pop nest, below the loop's own top connector).
TOP_LANE_Y0_MM = 950.0
TOP_LANE_Y1_MM = 1000.0
TOP_LANE_DIVIDER_XS_MM = (95.0, 195.0, 295.0, 395.0)  # four dividers -> three lanes
TOP_LANE_DIVIDER_T_MM = 8.0

# Slingshots (task 8): above the inlanes, clear of the flipper's own swept
# envelope and the reconciled tip gap (2.1a's own bound, this story's own
# "Always" rule) -- verified against test/flipper-sweep-clearance.test.ts.
SLING_Y0_MM = 420.0
SLING_Y1_MM = 455.0
SLING_L_X0_MM, SLING_L_X1_MM = 70.0, 130.0
SLING_R_X0_MM, SLING_R_X1_MM = 360.0, 410.0

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
		add_guide_wall(f'col_guide_divider_{side}', divider_x0, divider_x1, DIVIDER_Y_BOTTOM_MM, GUIDE_Y_TOP_MM)
		divider_cx = (divider_x0 + divider_x1) / 2
		add_rubber_post(f'col_post_divider_{side}_lo', (divider_cx, DIVIDER_Y_BOTTOM_MM))
		add_rubber_post(f'col_post_divider_{side}_hi', (divider_cx, GUIDE_Y_TOP_MM))

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
	def add_loop_funnel(name, divider_x0, divider_x1, loop_x0, loop_x1):
		"""The trapezoid connecting the divider guide's own OUTLANE_WIDTH_MM
		span (at y = LOOP_FUNNEL_Y0_MM, flush with the existing post) to the
		wider LOOP_LANE_CLEAR_MM span (at y = LOOP_FUNNEL_Y1_MM) -- a single
		convex quad, the same angled-prism technique col_lane_deflector
		proved (identity object transform, angled mesh vertices)."""
		points = [
			(divider_x0, LOOP_FUNNEL_Y0_MM), (divider_x1, LOOP_FUNNEL_Y0_MM),
			(loop_x1, LOOP_FUNNEL_Y1_MM), (loop_x0, LOOP_FUNNEL_Y1_MM),
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
	add_loop_funnel('col_loop_l_funnel', left_divider_x0, left_divider_x1, loop_l_x0, loop_l_x1)
	add_box_wall('col_loop_l', loop_l_x0, loop_l_x1, LOOP_FUNNEL_Y1_MM, LOOP_TOP_INNER_Y_MM, 'plastic')

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
	add_loop_funnel('col_loop_r_funnel', right_divider_x0, right_divider_x1, loop_r_x0, loop_r_x1)
	add_box_wall('col_loop_r', loop_r_x0, loop_r_x1, LOOP_FUNNEL_Y1_MM, LOOP_TOP_INNER_Y_MM, 'plastic')

	# Top connector, joining both loops across the top of the table -- "both
	# lanes join across the top so a full orbit passes both" (task 3).
	add_box_wall(
		'col_loop_top',
		loop_l_x0 - 10.0, loop_r_x1 + 10.0,
		LOOP_TOP_INNER_Y_MM - GUIDE_T_MM, LOOP_TOP_INNER_Y_MM,
		'plastic',
	)

	# Spinner gate (task 4, Left Loop only -- SPEC CAP-26, machine-
	# behaviour.md:72): a thin stub protruding from the loop guide's own
	# inner face, narrow enough that the reference ball still clears the
	# remaining lane width comfortably (see this file's constants block). No
	# revolution counting here -- Story 2.3 owns the mechanical spin.
	add_box_wall(
		'col_spinner_l',
		loop_l_x0 - SPINNER_PROTRUDE_MM, loop_l_x0,
		SPINNER_Y_MM - 3.0, SPINNER_Y_MM + 3.0,
		'rubber_band',
	)

	# DW-58's own consequence, verified empirically (this story's own planning
	# pass, not merely derived by inspection): gravity has no x-component
	# (2.1a's own Design Notes), so a ball launched dead straight up the
	# plunger lane carries NO lateral drift at all -- open space alone past
	# LANE_WALL_TOP_Y_MM does not "turn the ball into the field"; it needs an
	# actual angled surface to deflect it sideways, exactly the job the
	# retired col_lane_deflector did. The Right Loop's own upper arc supplies
	# that surface -- an angled prism at the plunger lane's own top,
	# geometrically identical to the retired deflector (same hypotenuse, low-
	# right (PLAYFIELD_W_MM, ~976) to high-left (LANE_X0_MM + WALL_T_MM,
	# ~1010)) but now authored as part of the loop rather than a standalone
	# node, so DW-58's own claim ("the Right Loop's own upper arc turns the
	# launched ball into the field") is genuinely true rather than merely
	# asserted. Identity object transform, angled mesh vertices -- the same
	# technique the retired node proved.
	col_loop_r_deflector = new_prism_mesh(
		'col_loop_r_deflector',
		[
			(LANE_X0_MM + WALL_T_MM, LOOP_TOP_INNER_Y_MM),
			(PLAYFIELD_W_MM, LOOP_TOP_INNER_Y_MM - 34.0),
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
	add_box_wall('col_ramp_wall_l', ramp_lane_x0 - WALL_T_MM, ramp_lane_x0, RAMP_ENTER_Y_MM, RAMP_TOP_Y_MM, 'ramp')
	add_box_wall('col_ramp_wall_r', ramp_lane_x1, ramp_lane_x1 + WALL_T_MM, RAMP_ENTER_Y_MM, RAMP_TOP_Y_MM, 'ramp')

	# Return rail: a single bent rail, the exact add_channel_rail() technique
	# 2.1a's own outlane return channel proved, from the top of the
	# up-channel down into the RIGHT inlane -- landing well clear of both the
	# Right Loop's own lane and the right slingshot.
	ramp_return_points = [
		(ramp_lane_x1, RAMP_TOP_Y_MM),
		(ramp_lane_x1 + 40.0, RAMP_TOP_Y_MM - 37.0),
		(ramp_lane_x1 + 23.0, SLING_Y1_MM + 15.0),
	]
	for i in range(len(ramp_return_points) - 1):
		add_channel_rail(f'col_ramp_return_{i + 1}', ramp_return_points[i], ramp_return_points[i + 1], WALL_T_MM)

	# ---- Dragon body + Lock lane (task 6, AD-6): off-centre (left of
	# PLAYFIELD_W_MM / 2 = 257.2 -- decisions-rejected.md:14,
	# machine-behaviour.md:9: the RIGHT flipper takes it straight, the LEFT
	# flipper backhands it), the Lock lane between its legs admitting a
	# precise shot, a body face a slightly-off shot strikes instead (FR-29).
	# bd_lock is authored at the Mouth pose above the body, aimed DOWN-TABLE
	# toward the flippers -- AD-6: "the Lock's pose IS the Mouth". ----
	lock_lane_x0 = DRAGON_CENTER_X_MM - LOCK_LANE_CLEAR_MM / 2
	lock_lane_x1 = DRAGON_CENTER_X_MM + LOCK_LANE_CLEAR_MM / 2
	dragon_leg_l_x0, dragon_leg_l_x1 = lock_lane_x0 - DRAGON_LEG_W_MM, lock_lane_x0
	dragon_leg_r_x0, dragon_leg_r_x1 = lock_lane_x1, lock_lane_x1 + DRAGON_LEG_W_MM
	add_box_wall('col_dragon_leg_l', dragon_leg_l_x0, dragon_leg_l_x1, DRAGON_LEG_Y0_MM, DRAGON_LEG_Y1_MM, 'dragon')
	add_box_wall('col_dragon_leg_r', dragon_leg_r_x0, dragon_leg_r_x1, DRAGON_LEG_Y0_MM, DRAGON_LEG_Y1_MM, 'dragon')

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
	for i, letter in enumerate(DRAGON_LETTERS):
		cx = DRAGON_BANK_X0_MM + i * DRAGON_BANK_PITCH_MM + DRAGON_BANK_TARGET_W_MM / 2
		add_box_wall(
			f'col_dragon_{letter}',
			cx - DRAGON_BANK_TARGET_W_MM / 2, cx + DRAGON_BANK_TARGET_W_MM / 2,
			DRAGON_BANK_Y0_MM, DRAGON_BANK_Y1_MM,
			'target',
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
	# above GUIDE_Y_TOP_MM's own pocket geometry). ----
	add_box_wall('col_sling_l', SLING_L_X0_MM, SLING_L_X1_MM, SLING_Y0_MM, SLING_Y1_MM, 'rubber_band')
	add_box_wall('col_sling_r', SLING_R_X0_MM, SLING_R_X1_MM, SLING_Y0_MM, SLING_Y1_MM, 'rubber_band')

	# ---- Pop bumpers (task 8): a nest of exactly three (author-decided
	# 2026-08-31 -- TABLE.authoredCounts.popBumpers records the count and its
	# provenance). Octagon posts, the same shape add_rubber_post() uses,
	# scaled to a pop-bumper-sized radius. ----
	POP_POSITIONS_MM = ((130.0, 800.0), (230.0, 800.0), (180.0, 870.0))
	for i, center in enumerate(POP_POSITIONS_MM):
		post = new_prism_mesh(f'col_pop_{i + 1}', octagon_points_mm(center, POP_BUMPER_RADIUS_MM), 0.0, WALL_H_MM, parent=playfield_root)
		set_props(post, col_shape='wall', surface='bumper', phys_material='default')

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
	add_switch_zone('sw_loop_l_in', 's_loop_l_in', (2, 425, 0), (32, 475, 30))
	add_switch_zone('sw_loop_l_out', 's_loop_l_out', (5, 820, 0), (45, 880, 30))
	add_switch_zone('sw_loop_r_in', 's_loop_r_in', (436, 425, 0), (466, 475, 30))
	add_switch_zone('sw_loop_r_out', 's_loop_r_out', (423, 820, 0), (463, 880, 30))
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
	add_switch_zone('sw_lock_lane', 's_lock_lane', (lock_lane_x0 + 2, 500, 0), (lock_lane_x1 - 2, 560, 30))
	LOCK_SLOT_NAMES = ('s_lock_1', 's_lock_2', 's_lock_3')
	for i, switch_name in enumerate(LOCK_SLOT_NAMES):
		slot_y0 = DRAGON_MOUTH_Y_MM - 20.0 + i * 17.0
		add_switch_zone(f'sw_lock_{i + 1}', switch_name, (lock_lane_x0, slot_y0, 0), (lock_lane_x1, slot_y0 + 14.0, 30))

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
	# the generic tracker by AD-6): sited right where the ball crosses off
	# the visible deck, one tick's margin above the trough zones' own y = 0
	# ceiling.
	add_switch_zone('sw_drain', 's_drain', (DRAIN_X0_MM, -5, 0), (DRAIN_X1_MM, 15, 30))

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
		vis_playfield, l_insert_left, bd_trough, bd_shooter, bd_lock,
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
