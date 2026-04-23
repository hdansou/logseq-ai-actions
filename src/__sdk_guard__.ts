import "@logseq/libs";

// Compile-time guard: references an API that exists in @logseq/libs ≥ 0.3.1.
// If typecheck fails here, the SDK pin in package.json has drifted below the
// floor — bump it rather than widening the type. Not imported at runtime;
// tree-shaken from the production bundle.
//
// See runtime-gotchas "SDK version-check gate" for why this matters.
export const _sdkGuard: typeof logseq.App.getCurrentRoute = logseq.App.getCurrentRoute;
