import { AppError } from "../../errors";

export function payout(accountId: string) {
  try {
    return gateway.payout(accountId);
  } catch (err) {
    throw new AppError("PAYOUT_FAILED", "payout failed", err);
  }
}
