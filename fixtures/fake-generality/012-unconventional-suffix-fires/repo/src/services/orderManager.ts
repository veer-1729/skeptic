export class OrderManager {
  list(): string[] {
    return [];
  }
}

export function bootstrap(): string[] {
  const mgr = new OrderManager();
  return mgr.list();
}
