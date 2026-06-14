import { AppError } from "../../errors";

export function charge(orderId: string) {
  try {
    return gateway.charge(orderId);
  } catch (err) {
    throw new AppError("CHARGE_FAILED", "charge failed", err);
  }
}
