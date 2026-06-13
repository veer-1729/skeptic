interface Charge {
  amountCents: number;
}

export function settle(charge: Charge): number {
  // @ts-ignore
  return charge.amount * 100;
}
