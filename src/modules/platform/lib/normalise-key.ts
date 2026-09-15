// camelCase / kebab-case → snake_case so one pattern set covers `userEmail`, `user_email`, `user-email`.
// Shared by the log scrubber (by-key redaction) and the client-error guard (by-key secret redaction).
export const normaliseKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
