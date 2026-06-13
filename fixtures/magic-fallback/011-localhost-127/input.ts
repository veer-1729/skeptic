export function dbHost(): string {
  return process.env.DB_HOST || "127.0.0.1";
}
