export function createSession(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid body");
  }
  const b = body as { token?: unknown };
  if (!b.token || typeof b.token !== "string") {
    throw new Error("token required");
  }
  return db.insert(b);
}
