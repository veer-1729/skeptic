import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import type { AnalysisMeta, DetectorInput, NeighborFile } from "../types.js";
import { parseManifest } from "../context/manifest.js";

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "out",
  ".next",
  ".turbo",
  "vendor",
  "fixtures",
]);

export function isScannableSource(path: string): boolean {
  return SOURCE_EXT.test(path);
}

/** Recursively list scannable source files under `root`, repo-relative paths. */
export function listSourceFiles(root: string): string[] {
  const out: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const rel = relative(root, abs).split("\\").join("/");
      if (SKIP_DIRS.has(entry)) continue;
      const st = statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (isScannableSource(rel)) out.push(rel);
    }
  }

  walk(root);
  return out.sort();
}

export function readRepoFile(root: string, relPath: string): string {
  return readFileSync(join(root, relPath), "utf-8");
}

/** Package names declared in the repo's package.json (if present). */
export function packageNamesFromRoot(root: string): string[] {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath)) return [];
  return parseManifest("package.json", readFileSync(pkgPath, "utf-8")).map((e) => e.name);
}

/** Build shared AnalysisMeta for a scan unit from on-disk manifests. */
export function buildScanMeta(root: string, existingPackages?: string[]): AnalysisMeta {
  const known = packageNamesFromRoot(root);
  return {
    packages: {
      known,
      existing: existingPackages ?? known,
    },
  };
}

export function buildScanInputs(
  root: string,
  changed: { path: string; addedRanges: { start: number; end: number }[] }[],
  meta: AnalysisMeta,
): DetectorInput[] {
  return changed
    .filter((c) => isScannableSource(c.path) || /package\.json$/.test(c.path) || /requirements\.txt$/.test(c.path))
    .map((c) => ({
      file: c.path,
      content: readRepoFile(root, c.path),
      meta,
      addedRanges: c.addedRanges,
    }));
}

export function buildCorpus(root: string, changedPaths: Set<string>, meta: AnalysisMeta): NeighborFile[] {
  return listSourceFiles(root)
    .filter((p) => !changedPaths.has(p))
    .map((path) => ({
      path,
      content: readRepoFile(root, path),
      meta,
    }));
}
