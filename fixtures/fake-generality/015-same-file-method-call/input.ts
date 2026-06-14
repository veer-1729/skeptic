interface Queue {
  process(): void;
}

export function process(item: string): string {
  return item.trim();
}

export function run(queue: Queue): void {
  queue.process();
}
