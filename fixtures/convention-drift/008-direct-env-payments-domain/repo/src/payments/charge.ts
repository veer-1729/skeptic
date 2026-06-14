import { config } from "../../config";

export function charge(orderId: string) {
  return gateway.charge(orderId, config.stripeKey);
}
