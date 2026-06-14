function onTick(): void {
  doWork();
}

export function start(): void {
  setInterval(onTick, 1000);
}
