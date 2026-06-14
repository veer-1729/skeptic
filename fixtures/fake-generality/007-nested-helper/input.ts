export function outer(items: number[]): number[] {
  function double(n: number): number {
    return n * 2;
  }
  return items.map((i) => double(i));
}
