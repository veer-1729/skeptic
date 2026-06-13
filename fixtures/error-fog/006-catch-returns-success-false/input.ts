export function trySettle(input: string): { success: boolean } {
  try {
    return { success: doSettle(input) };
  } catch (e) {
    return { success: false };
  }
}
