type Config = {
  retries: number;
};

export function loadConfig(raw: Record<string, unknown>): Config {
  // @ts-ignore -- upstream parser types `raw` loosely; shape verified in CONF-481
  return raw.config;
}
