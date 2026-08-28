// DragonWar is licensed GPL-3.0. See LICENSE, NOTICE, and ATTRIBUTIONS.md.
//
// AR-34, AD-17: the commit-SHA stamp. `import.meta.env.VITE_BUILD_SHA` is a
// Vite build-time substitution (Vite inlines every `VITE_`-prefixed env var
// present at build time as a literal into the emitted bundle) -- not a
// runtime environment read, which the Conventions table forbids ("nothing
// reads env at runtime"). `.github/workflows/ci.yml`'s `Build` step sets
// `VITE_BUILD_SHA: ${{ github.sha }}`; a local `pnpm build` with no such
// variable falls back to the literal `'dev'`.

/** The commit SHA this build was made from, or `'dev'` outside CI. Story 6.3 reads it for the Settings panel. */
export const BUILD_SHA: string = import.meta.env.VITE_BUILD_SHA ?? 'dev';
