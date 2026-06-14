import { logger } from "../logger";

export function listWidgets() {
  try {
    return db.query("select * from widgets");
  } catch (err) {
    logger.error("failed to list widgets", err);
  }
}
