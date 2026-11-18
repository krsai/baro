// Match module loading errors only. A component exception must not be reported
// as a deployment/network problem merely because it reached an error boundary.
export const isModuleLoadFailure=error=>error?.name==='ChunkLoadError'||/failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading (?:css )?chunk .+failed|unable to preload css/i.test(String(error?.message||''));
