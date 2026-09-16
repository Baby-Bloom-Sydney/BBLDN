// 05 §7 rule 3 — "no cycles at module level". Cross-module imports are restricted to connectors by rules 1–2,
// so the only module-level cycle that can exist is one the table itself declares; this proves it does not, at
// generation time, and names the path it found rather than just refusing.
export function assertAcyclic(
  graph: Readonly<Record<string, readonly string[]>>,
): void {
  const onPath = new Set<string>();
  const settled = new Set<string>();

  const walk = (node: string, trail: readonly string[]): void => {
    if (settled.has(node)) return;
    if (onPath.has(node)) {
      const from = trail.indexOf(node);
      throw new Error(
        `01 §2.3 declares a module-level cycle: ${[...trail.slice(from), node].join(" → ")}`,
      );
    }
    onPath.add(node);
    for (const next of graph[node] ?? []) walk(next, [...trail, node]);
    onPath.delete(node);
    settled.add(node);
  };

  for (const node of Object.keys(graph)) walk(node, []);
}
