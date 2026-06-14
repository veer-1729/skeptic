export function createWidget(body: unknown) {
  const b = body as { name?: unknown };
  if (!b.name || typeof b.name !== "string") {
    throw new Error("name required");
  }
  return db.insert(b);
}
