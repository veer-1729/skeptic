export function listSessions() {
  try {
    return db.query("select * from sessions");
  } catch (err) {
    console.error("failed to list sessions", err);
  }
}
