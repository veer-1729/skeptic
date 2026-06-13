export function verifySession(token: string): boolean {
  try {
    decodeToken(token);
    return true;
  } catch (e) {}
}
