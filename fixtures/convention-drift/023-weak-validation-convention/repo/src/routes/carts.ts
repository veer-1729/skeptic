export function createCart(body: unknown) {
  const b = body as { item?: unknown };
  if (!b.item || typeof b.item !== "string") {
    throw new Error("item required");
  }
  return db.insert(b);
}
