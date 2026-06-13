export interface ManifestEntry {
  name: string;
  /** 1-based line number of the dependency entry in the manifest. */
  line: number;
}

/** Whether `file` is a dependency manifest the phantom-dependency rules inspect. */
export function isManifest(file: string): boolean {
  return /package\.json$/.test(file) || /requirements\.txt$/.test(file);
}

/**
 * Extracts dependency names and their line numbers from a manifest file.
 * Returns an empty array for non-manifest inputs.
 */
export function parseManifest(file: string, content: string): ManifestEntry[] {
  if (/package\.json$/.test(file)) return parsePackageJson(content);
  if (/requirements\.txt$/.test(file)) return parseRequirementsTxt(content);
  return [];
}

function parsePackageJson(content: string): ManifestEntry[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }

  const names: string[] = [];
  const deps = parsed.dependencies as Record<string, string> | undefined;
  const devDeps = parsed.devDependencies as Record<string, string> | undefined;
  if (deps) names.push(...Object.keys(deps));
  if (devDeps) names.push(...Object.keys(devDeps));

  const lines = content.split("\n");
  const entries: ManifestEntry[] = [];
  for (const name of names) {
    const pattern = new RegExp(`"${escapeRegExp(name)}"\\s*:`);
    for (let i = 0; i < lines.length; i++) {
      if (pattern.test(lines[i]!)) {
        entries.push({ name, line: i + 1 });
        break;
      }
    }
  }
  return entries;
}

function parseRequirementsTxt(content: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("-r ") || line.startsWith("-e ") || line.startsWith("--")) continue;

    const hashIdx = line.indexOf("#");
    if (hashIdx >= 0) line = line.slice(0, hashIdx).trim();
    if (!line) continue;

    const semiIdx = line.indexOf(";");
    if (semiIdx >= 0) line = line.slice(0, semiIdx).trim();

    const match = line.match(/^([a-zA-Z0-9][\w.-]*)/);
    if (!match) continue;

    entries.push({ name: match[1]!, line: i + 1 });
  }

  return entries;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
