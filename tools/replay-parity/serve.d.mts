// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// Ambient declaration for serve.mjs's two exported regexes (Review finding
// 2026-08-29) -- serve.mjs itself stays plain, un-annotated JavaScript
// (matching every other tools/*.mjs file in this repo); this sibling
// declaration exists solely so test/replay-parity-logic.test.ts's import
// type-checks under tsconfig.node.json (`moduleResolution: "bundler"`,
// no `allowJs`). Kept in sync with serve.mjs by hand -- both are tiny and
// change together.

export declare const GOLDEN_NAME_PATTERN: RegExp;
export declare const GOLDEN_ROUTE_PATTERN: RegExp;
