type Config = {
  retries: number;
};

export function loadConfig(): Config {
  // @ts-expect-error
  return { retries: "3" };
}
