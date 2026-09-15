// camelCase / kebab-case → snake_case so one pattern set covers `userEmail`, `user_email`, `user-email`.
// The first pass splits an acronym run from the word after it (`IPAddress` → `IP_Address`), which the
// lowercase-then-uppercase rule alone cannot see — without it `IPAddress` normalises to `ipaddress`, has no `_`
// boundary, and escapes redaction while `ipAddress` does not.
// Shared by the log scrubber (by-key redaction) and the client-error guard (by-key secret redaction).
export const normaliseKey = (key: string): string =>
  key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
