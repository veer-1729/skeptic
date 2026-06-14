export function greeting(displayName: string): string {
  const [first] = displayName.split(" ");
  return `Hello, ${first}`;
}
