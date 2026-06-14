export function createProduct(body: unknown) {
  const b = body as { sku?: unknown };
  if (!b.sku || typeof b.sku !== "string") {
    throw new Error("sku required");
  }
  return db.insert(b);
}
