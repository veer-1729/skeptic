export function firstResult<T>(results: T[]): T | undefined {
  return results.at(0);
}
