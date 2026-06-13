export function fireAndForget(): void {
  doThing().catch(() => {});
}
