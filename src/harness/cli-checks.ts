/**
 * CLI-glue test harness. The detector/ranking/retrieval layers are covered by
 * the fixture suite (`runner.ts`); this covers the other half the CLI depends
 * on — the unified-diff parser (`cli/git-diff.ts`) and the repo loader
 * (`cli/load-repo.ts`), i.e. the parse-diff → build-inputs → addedRanges path a
 * real `npm run scan` rides on.
 *
 * Two surfaces, two styles:
 *  - diff parsing is pure, so it's data-driven: `cli-fixtures/diff/<name>/`
 *    holds an `input.diff` + an `expected.json` (`ParsedDiffFile[]`). These live
 *    OUTSIDE `fixtures/` on purpose — that tree is the detector harness's and is
 *    scanned as detector fixtures.
 *  - the loader touches the filesystem, so it's exercised against a hermetic
 *    temp repo built and torn down here (no committed fake tree).
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { parseUnifiedDiff } from "../cli/git-diff.js";
import {
  buildCorpus,
  buildScanInputs,
  buildScanMeta,
  isScannableSource,
  listSourceFiles,
} from "../cli/load-repo.js";

let passed = 0;
let failed = 0;

/** Recursively sort object keys so equality is independent of property order. */
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canon((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

function eq(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(canon(actual));
  const e = JSON.stringify(canon(expected));
  if (a === e) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(`        expected: ${e}`);
    console.log(`        actual:   ${a}`);
  }
}

function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const CLI_FIXTURES = join(process.cwd(), "cli-fixtures");

/** Data-driven cases for the unified-diff parser. */
function runDiffFixtures(): void {
  const diffDir = join(CLI_FIXTURES, "diff");
  for (const name of readdirSync(diffDir).sort()) {
    const dir = join(diffDir, name);
    if (!statSync(dir).isDirectory()) continue;
    const diff = readFileSync(join(dir, "input.diff"), "utf-8");
    const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf-8"));
    eq(`diff/${name}`, parseUnifiedDiff(diff), expected);
  }
}

/** Build a small on-disk repo and exercise the loader against it. */
function runLoadRepoChecks(): void {
  const root = mkdtempSync(join(tmpdir(), "skeptic-cli-"));
  try {
    const write = (rel: string, content: string) => {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    };

    write("package.json", JSON.stringify({ dependencies: { left: "1.0.0" }, devDependencies: { vitest: "1.0.0" } }));
    write("src/a.ts", "export const a = 1;\nexport const a2 = 2;\n");
    write("src/b.tsx", "export const b = 1;\n");
    write("src/notes.md", "# notes\n");
    write("dist/built.js", "module.exports = {};\n");
    write("node_modules/dep/index.ts", "export const dep = 1;\n");

    // isScannableSource — extension gate
    ok("loader: .ts is scannable", isScannableSource("src/a.ts"));
    ok("loader: .tsx is scannable", isScannableSource("src/b.tsx"));
    ok("loader: .mjs is scannable", isScannableSource("x.mjs"));
    ok("loader: .md is not scannable", !isScannableSource("src/notes.md"));
    ok("loader: package.json is not scannable", !isScannableSource("package.json"));

    // listSourceFiles — recursion, extension filter, skip dirs (node_modules/dist)
    eq("loader: listSourceFiles skips node_modules/dist and non-source", listSourceFiles(root), [
      "src/a.ts",
      "src/b.tsx",
    ]);

    // buildScanMeta — known packages pulled from package.json; existing defaults to known
    const meta = buildScanMeta(root);
    eq("loader: buildScanMeta known packages", [...(meta.packages?.known ?? [])].sort(), [
      "left",
      "vitest",
    ]);
    eq(
      "loader: buildScanMeta existing defaults to known",
      [...(meta.packages?.existing ?? [])].sort(),
      ["left", "vitest"],
    );

    // buildScanInputs — the parse-diff → build-inputs → addedRanges join:
    // reads on-disk content, carries addedRanges, drops non-scannable paths.
    const parsed = [
      { path: "src/a.ts", addedRanges: [{ start: 2, end: 2 }] },
      { path: "src/notes.md", addedRanges: [{ start: 1, end: 1 }] },
    ];
    const inputs = buildScanInputs(root, parsed, meta);
    eq("loader: buildScanInputs keeps only scannable paths", inputs.map((i) => i.file), ["src/a.ts"]);
    ok(
      "loader: buildScanInputs reads file content from disk",
      inputs[0]?.content === "export const a = 1;\nexport const a2 = 2;\n",
      JSON.stringify(inputs[0]?.content),
    );
    eq("loader: buildScanInputs carries addedRanges", inputs[0]?.addedRanges, [{ start: 2, end: 2 }]);

    // package.json is a manifest the phantom rules want even though it's "not scannable source"
    const manifestInputs = buildScanInputs(root, [{ path: "package.json", addedRanges: [{ start: 1, end: 1 }] }], meta);
    eq("loader: buildScanInputs keeps package.json manifest", manifestInputs.map((i) => i.file), ["package.json"]);

    // buildCorpus — every source file except the changed ones, node_modules/dist excluded
    const corpus = buildCorpus(root, new Set(["src/a.ts"]), meta);
    eq("loader: buildCorpus excludes changed, includes the rest", corpus.map((c) => c.path), ["src/b.tsx"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main(): void {
  console.log("— CLI glue checks —");
  runDiffFixtures();
  runLoadRepoChecks();

  console.log(`\n${passed}/${passed + failed} CLI checks passing`);
  if (failed > 0) process.exit(1);
}

main();
