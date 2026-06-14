export function listOrders() {
  try {
    return db.query("select * from orders");
  } catch (err) {
    console.error("failed to list orders", err);
  }
}
