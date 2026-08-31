// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: no-circular (AD-1, DW-105). The AUTHORED half of a
// cycle that spans an authored physics module and a frozen port. Story
// 2.1a narrowed `no-circular` from a directory-wide `from.pathNot` origin
// exemption to a `to.pathNot` PORTED-file target exemption precisely so
// this shape is caught; under the superseded rule NEITHER file could be a
// cycle origin, so the whole cycle was invisible.
import { ballValue } from '../ball/ball-hit';
export const loaderValue = ballValue + 1;
