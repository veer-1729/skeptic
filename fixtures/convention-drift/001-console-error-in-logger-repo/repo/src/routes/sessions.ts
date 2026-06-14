import { logger } from "../logger";

export function listSessions() {
  try {
    return db.query("select * from sessions");
  } catch (err) {
    logger.error("failed to list sessions", err);
  }
}
