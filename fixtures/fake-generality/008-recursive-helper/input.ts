function countdown(n: number): number {
  if (n <= 0) return 0;
  return countdown(n - 1);
}

export function run(): number {
  return countdown(5);
}
