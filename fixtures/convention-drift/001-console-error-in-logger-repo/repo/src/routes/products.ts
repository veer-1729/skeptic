import { logger } from "../logger";

export function listProducts() {
  try {
    return db.query("select * from products");
  } catch (err) {
    logger.error("failed to list products", err);
  }
}
