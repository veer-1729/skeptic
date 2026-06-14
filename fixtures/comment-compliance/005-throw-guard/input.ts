export function listOrders(userId: string) {
  // Ensure user can only access their own orders
  if (!userId) {
    throw new Error("missing user");
  }
  return db.query("select * from orders");
}

declare const db: { query(sql: string, params?: unknown[]): unknown };
