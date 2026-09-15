// glob-to-regexp.mjs — the small glob dialect the seed JSONs use (`**`, `*`, literal paths) as an anchored RegExp
// over repo-relative POSIX paths. One export.
export function globToRegExp(glob) {
  const escaped = glob
    .split("**")
    .map((segment) =>
      segment
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${escaped}$`);
}
