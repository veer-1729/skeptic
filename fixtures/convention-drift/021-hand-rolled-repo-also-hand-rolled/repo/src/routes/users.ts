export function createUser(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid body");
  }
  const b = body as { email?: unknown };
  if (!b.email || typeof b.email !== "string") {
    throw new Error("email required");
  }
  return db.insert(b);
}
