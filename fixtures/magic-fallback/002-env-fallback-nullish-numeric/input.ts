export function requestTimeoutMs(): number {
  return Number(process.env.TIMEOUT_MS) ?? 5000;
}
