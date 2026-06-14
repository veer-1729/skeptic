import { logger } from "../logger";

export function listOrders() {
  try {
    return db.query("select * from orders");
  } catch (err) {
    logger.error("failed to list orders", err);
  }
}
