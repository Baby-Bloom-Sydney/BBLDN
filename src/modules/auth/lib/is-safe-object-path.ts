// 07 §5.3 rule 2 — a storage object path is built from server-side values and addresses one object inside its
// bucket. Anything that could climb out of the caller's prefix (a leading `/`, a `..` segment, a backslash) or
// name nothing at all is refused before a URL is minted.
const SEGMENT_SEPARATOR = "/";

export function isSafeObjectPath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith(SEGMENT_SEPARATOR)) return false;
  if (path.includes("\\")) return false;
  if (path.includes("\0")) return false;
  return path
    .split(SEGMENT_SEPARATOR)
    .every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    );
}
