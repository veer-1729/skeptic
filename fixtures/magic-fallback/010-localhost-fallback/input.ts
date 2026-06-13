export function apiBaseUrl(): string {
  return process.env.API_URL || "http://localhost:3000";
}
