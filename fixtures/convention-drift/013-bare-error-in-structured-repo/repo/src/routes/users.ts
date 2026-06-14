import { AppError } from "../errors";

export function listUsers() {
  try {
    return db.query("select * from users");
  } catch (err) {
    throw new AppError("USER_LIST_FAILED", "failed to list users", err);
  }
}
