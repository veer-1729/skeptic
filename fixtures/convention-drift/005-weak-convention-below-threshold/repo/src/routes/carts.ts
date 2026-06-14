export function listCarts() {
  try {
    return db.query("select * from carts");
  } catch (err) {
    console.error("failed to list carts", err);
  }
}
