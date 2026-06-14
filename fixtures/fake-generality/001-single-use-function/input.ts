function formatOrderId(id: string): string {
  return `ORD-${id.toUpperCase()}`;
}

export function renderOrder(id: string): string {
  return formatOrderId(id);
}
