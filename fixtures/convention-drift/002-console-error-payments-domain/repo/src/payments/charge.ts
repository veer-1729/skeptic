import { logger } from "../logger";

export function charge(orderId: string) {
  try {
    return gateway.charge(orderId);
  } catch (err) {
    logger.error("charge failed", err);
  }
}
