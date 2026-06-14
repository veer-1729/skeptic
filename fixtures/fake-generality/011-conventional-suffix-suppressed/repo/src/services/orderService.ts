export class OrderService {
  list(): string[] {
    return [];
  }
}

export function bootstrap(): string[] {
  const svc = new OrderService();
  return svc.list();
}
