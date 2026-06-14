import { gateway } from "../gateway";

export function refund(orderId: string) {
  try {
    return gateway.refund(orderId);
  } catch (err) {
    console.error("refund failed", err);
  }
}
