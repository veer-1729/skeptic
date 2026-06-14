export function initials(customerName: string): string {
  return customerName.split(" ").map((part) => part[0]).join("");
}
