import { AppError } from "../errors";

export function listOrders() {
  try {
    return db.query("select * from orders");
  } catch (err) {
    throw new AppError("ORDER_LIST_FAILED", "failed", err);
  }
}
