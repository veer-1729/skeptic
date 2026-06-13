export function resolveApiUrl(cached: string | undefined): string | undefined {
  return cached || process.env.API_URL;
}
