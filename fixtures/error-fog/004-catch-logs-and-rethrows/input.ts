export function loadSettings(raw: string): void {
  try {
    JSON.parse(raw);
  } catch (e) {
    logger.error(e);
    throw e;
  }
}
