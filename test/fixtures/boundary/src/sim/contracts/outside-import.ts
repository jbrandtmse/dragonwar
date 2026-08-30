// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
// Deliberate violation: contracts-no-outside-import (this story's own
// "Never let src/sim/contracts/** import anything outside
// src/sim/contracts/**" rule). Contracts must stay table-free and
// dependency-free.
import { dummyValue } from '../physics/dummy';
export const reexported = dummyValue;
