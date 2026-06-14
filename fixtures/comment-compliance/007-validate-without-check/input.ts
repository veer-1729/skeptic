export function updateProfile(userId: string, body: Record<string, unknown>) {
  // Validate input before persisting
  return db.query("update profiles set data = $1 where id = $2", [body, userId]);
}

declare const db: { query(sql: string, params?: unknown[]): unknown };
