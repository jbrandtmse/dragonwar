// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: no-havok (AD-1, AD-16). @babylonjs/havok is banned
// everywhere -- DragonWar's physics is the ported vpx-js core, never the
// engine's own physics plugin.
import { HavokPlugin } from '@babylonjs/havok';
export const plugin = HavokPlugin;
