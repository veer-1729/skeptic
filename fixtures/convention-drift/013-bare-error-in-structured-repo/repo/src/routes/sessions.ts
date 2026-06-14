import { AppError } from "../errors";

export function listSessions() {
  try {
    return db.query("select * from sessions");
  } catch (err) {
    throw new AppError("SESSION_LIST_FAILED", "failed to list sessions", err);
  }
}
