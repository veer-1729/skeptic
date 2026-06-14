function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function scale(a: number, b: number): number {
  return clamp(a) + clamp(b);
}
