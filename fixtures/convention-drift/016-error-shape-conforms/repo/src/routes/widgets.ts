import { AppError } from "../errors";

export function listWidgets() {
  try {
    return db.query("select * from widgets");
  } catch (err) {
    throw new AppError("WIDGET_LIST_FAILED", "failed to list widgets", err);
  }
}
