// load-exclusions.mjs — reads a committed JSON array of globs (literal-exclusions.json, eslint.legacy-paths.json)
// and returns a predicate over repo-relative paths. Missing file = no exclusions. One export.
import { readFileSync } from "node:fs";
import { globToRegExp } from "./glob-to-regexp.mjs";

export function loadExclusions(file) {
  let globs;
  try {
    globs = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return () => false;
    throw error;
  }
  if (!Array.isArray(globs) || !globs.every((g) => typeof g === "string"))
    throw new Error(`${file} must be a JSON array of glob strings`);
  const patterns = globs.map(globToRegExp);
  return (relativePath) =>
    patterns.some((pattern) => pattern.test(relativePath));
}
