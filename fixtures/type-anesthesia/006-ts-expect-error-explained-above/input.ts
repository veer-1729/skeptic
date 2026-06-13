type LegacyEvent = {
  payload: string;
};

export function readEvent(input: LegacyEvent): string {
  // The legacy SDK declares `payload` as `any`; it is always a string at runtime.
  // @ts-expect-error
  return input.payload.trim();
}
