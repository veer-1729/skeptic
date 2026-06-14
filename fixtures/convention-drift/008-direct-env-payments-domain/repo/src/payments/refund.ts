import { config } from "../../config";

export function refund(orderId: string) {
  return gateway.refund(orderId, config.stripeKey);
}
