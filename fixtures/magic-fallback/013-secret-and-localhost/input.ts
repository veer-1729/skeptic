export function sessionSecret(): string {
  return process.env.SESSION_SECRET || "http://localhost:9000";
}
