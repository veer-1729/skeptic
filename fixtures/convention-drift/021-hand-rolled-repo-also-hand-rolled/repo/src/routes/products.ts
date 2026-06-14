export function createProduct(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid body");
  }
  const b = body as { sku?: unknown };
  if (!b.sku || typeof b.sku !== "string") {
    throw new Error("sku required");
  }
  return db.insert(b);
}
