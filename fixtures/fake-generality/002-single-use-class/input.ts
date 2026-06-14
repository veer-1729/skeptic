export class OrderService {
  process(id: string): string {
    return id;
  }
}

export function bootstrap(): string {
  const svc = new OrderService();
  return svc.process("x");
}
