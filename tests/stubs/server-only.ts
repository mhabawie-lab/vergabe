/**
 * Stub for the `server-only` package.
 *
 * The real package throws when imported outside a React Server Component.
 * Tests exercise those modules directly in Node, so the import is neutralised
 * here rather than removed from the source — the guard must stay effective in
 * the actual build.
 */
export {};
