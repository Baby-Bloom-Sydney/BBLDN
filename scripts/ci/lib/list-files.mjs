// list-files.mjs — recursive file listing for the CI check scripts (one export).
// Pure, dependency-free replacement for `rg --files`: returns absolute paths under
// `root` whose extension is in `extensions`, skipping any path segment in `skipDirs`.
// Symlinks are never followed (no reads outside the tree, no cycles); unreadable
// entries are skipped, not fatal.
import { readdirSync, lstatSync } from "node:fs";
import { join, extname } from "node:path";

const DEFAULT_SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "dist",
  "out",
]);

/**
 * @param {string} root            absolute directory to walk (missing → empty list)
 * @param {object} options
 * @param {string[]} options.extensions   e.g. [".ts", ".tsx"]; empty = every file
 * @param {string[]} [options.skipDirs]   extra directory names to skip
 * @returns {string[]}
 */
export function listFiles(root, { extensions, skipDirs = [] }) {
  const skip = new Set([...DEFAULT_SKIP_DIRS, ...skipDirs]);
  const wanted = new Set(extensions);
  const found = [];
  const pending = [root];

  while (pending.length > 0) {
    const dir = pending.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // missing or unreadable directory: nothing to list
    }
    for (const name of entries) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      let info;
      try {
        info = lstatSync(path);
      } catch {
        continue; // vanished or unreadable entry: skip
      }
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) pending.push(path);
      else if (wanted.size === 0 || wanted.has(extname(name))) found.push(path);
    }
  }
  return found.sort();
}
