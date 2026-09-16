"use strict";

// Where a file sits in the module tree, and how a relative specifier written in it resolves. Both boundary
// rules need exactly this, and when each carried its own copy the two immediately drifted — one grew the
// narrow test-file exemption and the other did not (typescript-reviewer, S6 review). One definition, so the
// static and dynamic halves of rule 2 cannot disagree again.

const MODULE_ROOT = /^(?<root>.*\/src\/modules\/[^/]+\/)/u;
const MODULES_ROOT = "/src/modules/";

const isTestPath = (posixPath) =>
  posixPath.includes("/__tests__/") ||
  /\.(test|spec)\.[cm]?[jt]sx?$/u.test(posixPath);

/** Joins a relative specifier onto a directory, resolving `.` and `..`, without touching the filesystem. */
function resolvePosix(fromDirectory, specifier) {
  const segments = [];
  for (const segment of `${fromDirectory}/${specifier}`.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  return `/${segments.join("/")}`;
}

/**
 * `null` for a file outside `src/modules/<module>/` — there is no module to hold anything inside, so the
 * boundary rules stand down. Otherwise the module's name, its root, and the two questions both rules ask of a
 * relative specifier.
 */
module.exports = function moduleContextOf(rawFilename) {
  const filename = (rawFilename ?? "").replace(/\\/gu, "/");
  const root = MODULE_ROOT.exec(filename)?.groups?.root;
  if (root === undefined) return null;

  const directory = filename.slice(0, filename.lastIndexOf("/"));
  const segments = root.split("/").filter(Boolean);

  return {
    root,
    moduleName: segments[segments.length - 1],
    // A test may reach the repo's own tooling outside `src/modules` — `config.repo.test.ts` reads the
    // generators to prove the committed `.env.example` is what they write. It may not reach into another
    // module's inside: that is the same erosion as production code doing it.
    isTest: isTestPath(filename),
    resolve: (specifier) => resolvePosix(directory, specifier),
    staysInside: (resolved) => resolved.startsWith(root),
    leavesModuleTree: (resolved) => !resolved.includes(MODULES_ROOT),
    /** The path from `src/` down, for a message a reader can place without the checkout prefix. */
    display: (resolved) => {
      const at = resolved.indexOf("/src/");
      return at === -1 ? resolved : resolved.slice(at + 1);
    },
  };
};
