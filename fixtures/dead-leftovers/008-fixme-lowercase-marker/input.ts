export function fetchUser(id: string): string {
  // fixme: trim is not enough, normalize unicode too
  return id.trim();
}
