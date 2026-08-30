// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-table-no-physics-rules-loop (AD-1). sim/table/**
// must not import sim/physics/**, sim/rules/** or sim/loop/**.
import { dummyValue } from '../physics/dummy';
export const tableReachesPhysics = dummyValue;
