interface Item {
  id: string;
  price: number;
}

export function priceOf(items: Item[], id: string): number {
  const match = items.find((item) => item.id === id);
  return match!.price;
}
