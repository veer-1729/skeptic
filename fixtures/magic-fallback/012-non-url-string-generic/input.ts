export function logLevel(): string {
  return process.env.LOG_LEVEL || "debug";
}
