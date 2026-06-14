export function createOrder(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid body");
  }
  const b = body as { id?: unknown };
  if (!b.id || typeof b.id !== "string") {
    throw new Error("id required");
  }
  return db.insert(b);
}
