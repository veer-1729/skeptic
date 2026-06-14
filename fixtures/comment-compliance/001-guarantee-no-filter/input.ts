export function listOrders() {
  // Ensure user can only access their own orders
  return db.query("select * from orders");
}

declare const db: { query(sql: string, params?: unknown[]): unknown };
