export function listCharges() {
  // Must prevent cross-tenant charge access
  return db.query("select * from charges");
}

declare const db: { query(sql: string, params?: unknown[]): unknown };
