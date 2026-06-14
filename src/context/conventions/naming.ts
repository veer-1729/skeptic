import ts from "typescript";
import type { NeighborFile } from "../../types.js";

/**
 * Generic, "abstraction-shaped" type suffixes (taxonomy Category 4). A new
 * single-use `*Service`/`*Manager`/… is the textbook fake-generality smell —
 * *unless* the repo already names things this way, in which case it's just the
 * house style. This module measures that "house style" from the neighbors so
 * the detector can suppress on a repo-conventional suffix (the Layer-C carve-out
 * the taxonomy calls for), mirroring `conventions/logging.ts`.
 */
export const GENERIC_SUFFIXES = [
  "Service",
  "Manager",
  "Handler",
  "Processor",
  "Adapter",
  "Strategy",
  "Factory",
  "Controller",
  "Provider",
  "Repository",
] as const;

/**
 * The generic suffix `name` ends with, or `null`. The name must be strictly
 * longer than the suffix (so a bare `Service` doesn't match). Longest suffix
 * wins on the rare overlap.
 */
export function suffixOf(name: string): string | null {
  let best: string | null = null;
  for (const suffix of GENERIC_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      if (best === null || suffix.length > best.length) best = suffix;
    }
  }
  return best;
}

/** Top-level-ish declared names in a file: classes, interfaces, type aliases, functions. */
function declaredNames(content: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isTypeAliasDeclaration(node)) &&
      node.name
    ) {
      names.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return names;
}

export interface NamingProfile {
  /**
   * Generic suffix → sorted repo-relative paths of the neighbor files that
   * declare at least one name with that suffix. The path count per suffix is
   * the convention's strength.
   */
  bySuffix: Map<string, string[]>;
}

/** Build a naming profile from neighbor files: which generic suffixes the repo uses, and where. */
export function namingProfile(neighbors: NeighborFile[]): NamingProfile {
  const sets = new Map<string, Set<string>>();
  for (const neighbor of neighbors) {
    const suffixesInFile = new Set<string>();
    for (const name of declaredNames(neighbor.content, neighbor.path)) {
      const suffix = suffixOf(name);
      if (suffix) suffixesInFile.add(suffix);
    }
    for (const suffix of suffixesInFile) {
      const set = sets.get(suffix) ?? new Set<string>();
      set.add(neighbor.path);
      sets.set(suffix, set);
    }
  }
  const bySuffix = new Map<string, string[]>();
  for (const [suffix, paths] of sets) bySuffix.set(suffix, [...paths].sort());
  return { bySuffix };
}

/**
 * Minimum number of neighbor files sharing a suffix before it counts as a real
 * repo convention. Matches `logging.ts`'s `MIN_RELEVANT_NEIGHBORS`: below this
 * the repo simply isn't evidence that the pattern is the house style.
 */
export const MIN_SUFFIX_NEIGHBORS = 3;

/** Suffixes the repo uses widely enough to treat as an established convention. */
export function establishedSuffixes(
  profile: NamingProfile,
  min = MIN_SUFFIX_NEIGHBORS,
): Set<string> {
  const established = new Set<string>();
  for (const [suffix, paths] of profile.bySuffix) {
    if (paths.length >= min) established.add(suffix);
  }
  return established;
}
