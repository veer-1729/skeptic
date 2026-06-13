export function apiBaseUrl(): string | undefined {
  const x = process.env.API_URL;
  return x;
}
