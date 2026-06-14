import { AppError } from "../errors";

export function listProducts() {
  try {
    return db.query("select * from products");
  } catch (err) {
    throw new AppError("PRODUCT_LIST_FAILED", "failed to list products", err);
  }
}
