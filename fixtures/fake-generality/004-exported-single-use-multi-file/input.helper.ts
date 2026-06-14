export function buildHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
