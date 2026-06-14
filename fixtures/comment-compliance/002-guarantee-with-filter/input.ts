export function listOrders(userId: string) {
  // Ensure user can only access their own orders
  return db.query("select * from orders where userId = $1", [userId]);
}

declare const db: { query(sql: string, params?: unknown[]): unknown };
