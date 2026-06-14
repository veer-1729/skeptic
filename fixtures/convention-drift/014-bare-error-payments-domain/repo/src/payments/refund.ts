import { AppError } from "../../errors";

export function refund(orderId: string) {
  try {
    return gateway.refund(orderId);
  } catch (err) {
    throw new AppError("REFUND_FAILED", "refund failed", err);
  }
}
