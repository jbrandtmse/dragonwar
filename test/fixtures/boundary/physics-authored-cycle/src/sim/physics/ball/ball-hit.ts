// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// The PORTED half of the deliberate DW-105 cycle -- see ../loader/index.ts.
// `ball/ball-hit` is absent from the config's AUTHORED_PHYSICS_FILES list,
// so it is a ported file: exempt as a cycle TARGET, never as an ORIGIN.
import { loaderValue } from '../loader';
export const ballValue = 1;
// Referenced so swc's unused-import elimination (if any) cannot make this
// edge disappear from the cruised graph.
export const ballReferencesLoader = () => loaderValue;
