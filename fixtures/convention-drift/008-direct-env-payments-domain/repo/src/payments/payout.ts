import { config } from "../../config";

export function payout(accountId: string) {
  return gateway.payout(accountId, config.stripeKey);
}
