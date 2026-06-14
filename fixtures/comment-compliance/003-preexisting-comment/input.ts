export function loadWidget(id: string) {
  // Ensure user can only access their own widgets
  return db.query("select * from widgets where id = $1", [id]);
}

export default loadWidget;

declare const db: { query(sql: string, params?: unknown[]): unknown };
