import { formatCurrency } from "fast-currency-utilz";

export function priceLabel(cents: number): string {
  return formatCurrency(cents / 100);
}
