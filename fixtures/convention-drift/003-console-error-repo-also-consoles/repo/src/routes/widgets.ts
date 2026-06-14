export function listWidgets() {
  try {
    return db.query("select * from widgets");
  } catch (err) {
    console.error("failed to list widgets", err);
  }
}
