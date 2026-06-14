import { logger } from "../logger";

export function settle(batchId: string) {
  try {
    return gateway.settle(batchId);
  } catch (err) {
    logger.error("settle failed", err);
  }
}
