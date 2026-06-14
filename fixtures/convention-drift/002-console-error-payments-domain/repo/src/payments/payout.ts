import { logger } from "../logger";

export function payout(vendorId: string) {
  try {
    return gateway.payout(vendorId);
  } catch (err) {
    logger.error("payout failed", err);
  }
}
