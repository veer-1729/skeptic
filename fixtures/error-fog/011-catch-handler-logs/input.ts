export function fireAndForget(): void {
  doThing().catch((err) => logger.error(err));
}
