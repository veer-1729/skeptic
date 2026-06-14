import { logger } from "../logger";

export function listUsers() {
  try {
    return db.query("select * from users");
  } catch (err) {
    logger.error("failed to list users", err);
  }
}
