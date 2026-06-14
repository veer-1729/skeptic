const computeTax = (amount: number): number => amount * 0.2;

export function total(amount: number): number {
  return amount + computeTax(amount);
}
