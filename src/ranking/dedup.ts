import type { RankedFinding } from "../types.js";

/**
 * Deduplicate co-located findings (arch §3.5): findings on the same file whose
 * line ranges overlap are the classic "this one spot is the problem" cluster
 * (fake-generality + modular-mirage + blast-radius all firing on the same
 * lines). Rather than three line items, collapse each cluster to its highest-
 * scored survivor and record the absorbed rule IDs on `correlatedWith`.
 *
 * Pure: returns a new array; clusters are built per file by a sweep over
 * line-sorted ranges, so overlap is transitive (A–B, B–C ⇒ one cluster).
 * Findings that overlap nothing pass through untouched (no `correlatedWith`).
 */
export function dedupeFindings(findings: RankedFinding[]): RankedFinding[] {
  const byFile = new Map<string, RankedFinding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }

  const result: RankedFinding[] = [];
  for (const list of byFile.values()) {
    const sorted = [...list].sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd);

    let cluster: RankedFinding[] = [];
    let clusterMaxEnd = -Infinity;
    const flush = () => {
      if (cluster.length > 0) result.push(mergeCluster(cluster));
    };

    for (const f of sorted) {
      if (cluster.length === 0 || f.lineStart <= clusterMaxEnd) {
        cluster.push(f);
        clusterMaxEnd = Math.max(clusterMaxEnd, f.lineEnd);
      } else {
        flush();
        cluster = [f];
        clusterMaxEnd = f.lineEnd;
      }
    }
    flush();
  }

  return result;
}

/** Pick the survivor (highest score, then ruleId for determinism) and fold the rest in. */
function mergeCluster(cluster: RankedFinding[]): RankedFinding {
  if (cluster.length === 1) return cluster[0];

  const [survivor, ...absorbed] = [...cluster].sort(
    (a, b) => b.score - a.score || a.ruleId.localeCompare(b.ruleId),
  );

  const correlatedWith = [...new Set(absorbed.map((f) => f.ruleId))]
    .filter((id) => id !== survivor.ruleId)
    .sort();

  return correlatedWith.length > 0 ? { ...survivor, correlatedWith } : survivor;
}
