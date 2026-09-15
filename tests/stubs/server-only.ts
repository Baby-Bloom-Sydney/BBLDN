// Vitest stand-in for the `server-only` package (aliased in vitest.config.ts). The real package throws when
// imported outside a React Server Component graph; under vitest every module is "server", so this is empty.
export {};
