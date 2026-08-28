// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: sim-no-upward-import (AD-1), via a type-only import.
// This story's I/O matrix "Type-only upward import" row: a type-only import
// from sim/ into host/ must produce the same violation as a value import
// (verified during planning: the swc parser reports type-only imports).
import type { HelperType } from '../host/helper';
export type Reexported = HelperType;
