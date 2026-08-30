// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-babylon (AD-1). sim/ never imports @babylonjs/*.
import { Engine } from '@babylonjs/core/Engines/engine';
export const engineCtor = Engine;
