export function listUsers() {
  try {
    return db.query("select * from users");
  } catch (err) {
    console.error("failed to list users", err);
  }
}
