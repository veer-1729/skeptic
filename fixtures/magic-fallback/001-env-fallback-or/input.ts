export function apiBaseUrl(): string {
  return process.env.API_URL || "https://api.example.com";
}
