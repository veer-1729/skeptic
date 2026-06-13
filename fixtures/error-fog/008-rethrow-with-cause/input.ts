export function settle(raw: string): number {
  try {
    return doSettle(raw);
  } catch (e) {
    throw new Error("settle failed", { cause: e });
  }
}
