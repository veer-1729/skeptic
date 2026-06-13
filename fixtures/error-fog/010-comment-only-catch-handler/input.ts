export function syncInBackground(): void {
  syncData().catch((e) => {
    // ignore sync failures
  });
}
