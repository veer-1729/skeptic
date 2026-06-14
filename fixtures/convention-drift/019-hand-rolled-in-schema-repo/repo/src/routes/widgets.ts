export function createWidget(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid body");
  }
  const b = body as { name?: unknown };
  if (!b.name || typeof b.name !== "string") {
    throw new Error("name required");
  }
  return db.insert(b);
}
