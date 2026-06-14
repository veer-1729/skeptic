export function listProducts() {
  try {
    return db.query("select * from products");
  } catch (err) {
    console.error("failed to list products", err);
  }
}
