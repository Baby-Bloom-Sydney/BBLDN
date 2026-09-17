// The `next/headers` double the action suites share: a cookie jar and empty headers, so an action that mints,
// reads or clears a carried token (ADR-150) can be asserted on what it left in the jar. `vi.mock` hoists, so
// each suite installs it with `vi.mock("next/headers", () => cookieJarModule())`; the jar is reachable through
// `jarOf()` because a hoisted factory cannot close over a suite-level `let`.
type Cookie = { readonly name: string; readonly value: string };

const state: { jar: Map<string, string> } = { jar: new Map() };

export const jarOf = (): Map<string, string> => state.jar;

export const resetJar = (): void => {
  state.jar = new Map();
};

export function cookieJarModule() {
  return {
    cookies: () => ({
      get: (name: string): Cookie | undefined =>
        state.jar.has(name)
          ? { name, value: state.jar.get(name) ?? "" }
          : undefined,
      set: (
        nameOrCookie: string | { readonly name: string; readonly value: string },
        value?: string,
      ): void => {
        if (typeof nameOrCookie === "string")
          state.jar.set(nameOrCookie, value ?? "");
        else state.jar.set(nameOrCookie.name, nameOrCookie.value);
      },
      delete: (name: string): void => {
        state.jar.delete(name);
      },
    }),
    headers: () => new Headers(),
  };
}
