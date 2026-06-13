interface Flag {
  enabled: boolean;
}

export function isDisabled(flag: Flag): boolean {
  const enabled = flag.enabled;
  return !enabled;
}
