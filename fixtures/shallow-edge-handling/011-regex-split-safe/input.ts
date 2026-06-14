export function parseName(fullName: string): [string, string] {
  const parts = fullName.split(/\s+/, 2);
  return [parts[0] ?? "", parts[1] ?? ""];
}
